import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageToVideo, generateCoverImages } from "@/lib/higgsfield";
import type { ContentGenerationRequest, BookSnapshot, TextContent } from "./schemas";
import { validateTextContent } from "./schemas";
import {
  buildCopywriterSystemPrompt,
  buildCopywriterUserPrompt,
  buildVideoPrompt,
  buildImagePrompt,
} from "./prompt-templates";

export interface GenerateContentInput {
  bookId: string;
  userId: string;
  request: ContentGenerationRequest;
  snapshot: BookSnapshot;
}

export interface GenerateContentOutput {
  assetId: string;
  version: number;
  contentType: string;
  channel: string;
  assetUrl: string | null;
  textContent: TextContent | null;
  metadata: Record<string, unknown>;
}

/**
 * Orchestrate content generation: create DB record, call provider, update result.
 */
export async function generateContent(
  input: GenerateContentInput
): Promise<GenerateContentOutput> {
  const { bookId, userId, request, snapshot } = input;
  const admin = createAdminClient();

  // Determine next version
  const { data: existing } = await admin
    .from("content_assets" as never)
    .select("version")
    .eq("book_id", bookId)
    .eq("content_type", request.contentType)
    .eq("channel", request.channel)
    .order("version", { ascending: false })
    .limit(1);

  const rows = (existing ?? []) as Record<string, unknown>[];
  const lastVersion = rows[0]?.version;
  const nextVersion = (typeof lastVersion === "number" ? lastVersion : 0) + 1;

  // Create pending asset record
  const { data: asset, error: insertErr } = await admin
    .from("content_assets" as never)
    .insert({
      book_id: bookId,
      user_id: userId,
      content_type: request.contentType,
      channel: request.channel,
      version: nextVersion,
      status: "running",
      config: {
        language: request.language,
        tone: request.tone ?? null,
        durationSeconds: request.durationSeconds ?? null,
        aspectRatio: request.aspectRatio ?? null,
        audio: request.audio ?? true,
      },
      book_snapshot: snapshot,
    })
    .select("id")
    .single();

  if (insertErr || !asset) {
    throw new Error(`Failed to create content asset: ${insertErr?.message ?? "unknown"}`);
  }

  const assetId = String((asset as Record<string, unknown>).id);

  try {
    const result = await dispatchGeneration(request, snapshot);

    // Update asset with result
    await admin
      .from("content_assets" as never)
      .update({
        status: "completed",
        asset_url: result.assetUrl,
        text_content: result.textContent,
        prompt_template: result.promptTemplate,
        prompt_rendered: result.promptRendered,
        metadata: result.metadata,
      })
      .eq("id", assetId);

    return {
      assetId,
      version: nextVersion,
      contentType: request.contentType,
      channel: request.channel,
      assetUrl: result.assetUrl,
      textContent: result.textContent,
      metadata: result.metadata,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await admin
      .from("content_assets" as never)
      .update({
        status: "failed",
        error: errorMsg,
      })
      .eq("id", assetId);

    throw err;
  }
}

// ─── Internal dispatch ──────────────────────────────────────────────────────

interface DispatchResult {
  assetUrl: string | null;
  textContent: TextContent | null;
  promptTemplate: string | null;
  promptRendered: string | null;
  metadata: Record<string, unknown>;
}

async function dispatchGeneration(
  request: ContentGenerationRequest,
  snapshot: BookSnapshot
): Promise<DispatchResult> {
  switch (request.contentType) {
    case "text":
      return generateText(request, snapshot);
    case "image":
      return generateImage(request, snapshot);
    case "video":
      return generateVideo(request, snapshot);
  }
}

async function generateText(
  request: ContentGenerationRequest,
  snapshot: BookSnapshot
): Promise<DispatchResult> {
  const systemPrompt = buildCopywriterSystemPrompt(request.channel, request.language);
  const userPrompt = buildCopywriterUserPrompt(
    snapshot,
    request.channel,
    request.tone,
    request.userPromptAddendum
  );

  // Template-based text generation
  const textContent: TextContent = {
    headline: request.headline ?? snapshot.title,
    body: request.body ?? `Upptäck ${snapshot.title} på Verkli.`,
    cta: request.cta ?? "Läs på Verkli",
    hashtags: "#verkli #böcker",
  };

  // Validate
  const validation = validateTextContent(textContent, snapshot, request.channel);

  return {
    assetUrl: null,
    textContent,
    promptTemplate: systemPrompt,
    promptRendered: userPrompt,
    metadata: {
      provider: "template",
      ...(validation.issues.length > 0
        ? { validationIssues: validation.issues }
        : {}),
    },
  };
}

async function generateImage(
  request: ContentGenerationRequest,
  snapshot: BookSnapshot
): Promise<DispatchResult> {
  const prompt = buildImagePrompt(snapshot, request.channel, request.userPromptAddendum);

  const result = await generateCoverImages({ prompt });

  return {
    assetUrl: result.imageUrls[0] ?? null,
    textContent: null,
    promptTemplate: null,
    promptRendered: prompt,
    metadata: {
      provider: "higgsfield",
      requestId: result.requestId,
      imageCount: result.imageUrls.length,
    },
  };
}

async function generateVideo(
  request: ContentGenerationRequest,
  snapshot: BookSnapshot
): Promise<DispatchResult> {
  const prompt = buildVideoPrompt(snapshot, request.channel, request.userPromptAddendum);
  const coverImageUrl = snapshot.coverImageUrl?.trim() ?? "";
  if (!coverImageUrl) {
    throw new Error(
      "[content generate] Cover image is required for Higgsfield video generation."
    );
  }

  const result = await generateImageToVideo({
    prompt,
    imageUrl: coverImageUrl,
    durationSeconds: request.durationSeconds,
    includeAudio: request.audio ?? true,
  });

  return {
    assetUrl: result.videoUrl,
    textContent: null,
    promptTemplate: null,
    promptRendered: prompt,
    metadata: {
      provider: "higgsfield",
      requestId: result.requestId,
      durationSeconds: request.durationSeconds ?? null,
      aspectRatio: request.aspectRatio ?? null,
      audio: request.audio ?? true,
    },
  };
}
