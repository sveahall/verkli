import { getCopywriterProvider } from "@/lib/ai/providers/server";
import type { TrailerGenerateRequest, TrailerOutput } from "./schemas";
import {
  TrailerOutputSchema,
  GENRE_TEMPLATES,
  validateTrailerOutput,
  truncateWords,
} from "./schemas";
import {
  buildTrailerSystemPrompt,
  buildTrailerUserPrompt,
} from "./prompt-templates";

export interface TrailerGenerateResult {
  output: TrailerOutput;
  metadata: {
    provider: string;
    stub?: boolean;
    validationIssues?: string[];
  };
}

/**
 * Generate trailer prompt metadata using the copywriter LLM provider.
 * Falls back to deterministic genre-based output if the LLM returns invalid data.
 * No DB persistence — this generates prompt metadata, not video assets.
 */
export async function generateTrailerPrompt(
  request: TrailerGenerateRequest
): Promise<TrailerGenerateResult> {
  const copywriter = getCopywriterProvider();
  const isStub = copywriter.name.startsWith("stub");

  const systemPrompt = buildTrailerSystemPrompt();
  const userPrompt = buildTrailerUserPrompt(request);

  let output: TrailerOutput;
  let validationIssues: string[] | undefined;

  try {
    const result = await copywriter.generate({ systemPrompt, userPrompt });
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    const zodResult = TrailerOutputSchema.safeParse(parsed);

    if (!zodResult.success) {
      output = buildFallbackOutput(request);
      validationIssues = zodResult.error.issues.map((i) => i.message);
    } else {
      // Enforce word limits by truncating
      output = {
        scenes: zodResult.data.scenes.map((s) => ({
          visual_prompt: truncateWords(s.visual_prompt, 40),
          duration: 5 as const,
        })),
        caption: zodResult.data.caption,
        hashtags: zodResult.data.hashtags.slice(0, 20),
        title_card: truncateWords(zodResult.data.title_card, 6),
      };

      const validation = validateTrailerOutput(output);
      if (!validation.valid) {
        validationIssues = validation.issues;
      }
    }
  } catch {
    // JSON parse failure or provider error — use fallback
    output = buildFallbackOutput(request);
  }

  return {
    output,
    metadata: {
      provider: copywriter.name,
      ...(isStub ? { stub: true } : {}),
      ...(validationIssues && validationIssues.length > 0
        ? { validationIssues }
        : {}),
    },
  };
}

/**
 * Deterministic fallback output built from genre templates.
 * Ensures the API always returns usable data even without a real LLM.
 */
function buildFallbackOutput(request: TrailerGenerateRequest): TrailerOutput {
  const template = GENRE_TEMPLATES[request.genre];
  const kw = request.keywords.slice(0, 3).join(", ");

  const scene1 = truncateWords(
    `Hook: ${template.visualDirection}. ${kw}.`,
    40
  );
  const scene2 = truncateWords(
    `Escalation: ${template.cameraWork}. Atmosphere shifts, ${template.atmosphere}.`,
    40
  );
  const scene3 = truncateWords(
    `Peak: Emotional climax, ${template.atmosphere}. ${template.cameraWork}.`,
    40
  );

  return {
    scenes: [
      { visual_prompt: scene1, duration: 5 },
      { visual_prompt: scene2, duration: 5 },
      { visual_prompt: scene3, duration: 5 },
    ],
    caption: template.captionPattern.replace("{title}", request.title),
    hashtags: template.hashtagPool.slice(0, 15),
    title_card: truncateWords(
      template.titleCardPattern.replace("{title}", request.title),
      6
    ),
  };
}
