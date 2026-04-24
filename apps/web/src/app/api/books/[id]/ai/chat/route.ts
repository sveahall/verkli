import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import {
  generateWritingAssistantReply,
  WritingAssistantError,
} from "@/lib/ai/writing-assistant";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_INVALID_REQUEST_BODY,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  chapterId: z.string().uuid().optional().nullable(),
  selectedText: z.string().max(4000).optional().nullable(),
  // history is accepted for forward-compatibility but ignored for now
  history: z.array(z.unknown()).max(50).optional(),
});

const chatLimiter = createPerUserRateLimiter({ maxPerMinute: 20 });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const user = gate.user;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }
  const bookId = parsedParams.data.id;

  const rl = await chatLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }
  const { message, chapterId, selectedText } = parsedBody.data;

  // Verify the book exists AND the caller owns it (RLS normally enforces this,
  // but an explicit check returns a clean error and defends against policy drift).
  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, user_id, title")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }
  if (book.user_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const bookTitle =
    typeof (book as { title?: unknown }).title === "string"
      ? ((book as { title: string }).title)
      : null;

  // Try LLM when enabled + NVIDIA_NIM_API_KEY is set. Fall back to templates
  // on any provider failure so the editor never breaks on a transient outage.
  if (isAiChatEnabled()) {
    try {
      const llm = await generateWritingAssistantReply({
        message,
        selectedText: selectedText ?? null,
        bookTitle,
      });
      return NextResponse.json({
        id: crypto.randomUUID(),
        role: "assistant",
        content: llm.content,
        bookId,
        chapterId: chapterId ?? null,
        source: "llm",
        usage: llm.usage ?? null,
      });
    } catch (err) {
      const code = err instanceof WritingAssistantError ? err.code : "PROVIDER_FAILED";
      console.warn("[ai.chat] LLM fallback to templates", {
        bookId,
        userId: user.id,
        code,
        message: err instanceof Error ? err.message : String(err),
      });
      // fall through to templates
    }
  }

  const response = buildTemplateReply(message, selectedText);

  return NextResponse.json({
    id: crypto.randomUUID(),
    role: "assistant",
    content: response,
    bookId,
    chapterId: chapterId ?? null,
    source: "template",
  });
}

function buildTemplateReply(message: string, selectedText: string | null | undefined): string {
  const lowerMessage = message.toLowerCase();
  const safeSelected = (selectedText ?? "").slice(0, 200);

  if (safeSelected && (lowerMessage.includes("rewrite") || lowerMessage.includes("omskriv"))) {
    return `Here's a suggested rewrite:\n\n"${safeSelected}..."\n\nConsider tightening the prose by removing filler words and strengthening active verbs. Focus on sensory details that ground the reader in the scene.`;
  }
  if (lowerMessage.includes("pacing") || lowerMessage.includes("tempo")) {
    return "To improve pacing in this section:\n\n1. Break long paragraphs into shorter beats\n2. Use shorter sentences during action\n3. Cut exposition that doesn't advance the plot\n4. Add white space between tense moments";
  }
  if (lowerMessage.includes("expand") || lowerMessage.includes("utveckla")) {
    return "To expand this scene, consider:\n\n• Add sensory details (what do characters see, hear, smell?)\n• Deepen internal monologue\n• Show character reactions through body language\n• Add dialogue that reveals character relationships";
  }
  if (lowerMessage.includes("dialogue") || lowerMessage.includes("dialog")) {
    return "Tips for stronger dialogue:\n\n• Each character should have a distinct voice\n• Cut dialogue tags where the speaker is clear\n• Use subtext — what characters don't say matters\n• Break up long speeches with action beats";
  }
  return "I can help you with your writing! Try asking me to:\n\n• Rewrite selected text\n• Improve pacing\n• Expand a scene\n• Fix dialogue\n\nSelect text in the editor first for targeted suggestions.";
}
