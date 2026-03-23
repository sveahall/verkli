import type { TrailerGenerateRequest, TrailerOutput } from "./schemas";
import {
  GENRE_TEMPLATES,
  validateTrailerOutput,
  truncateWords,
} from "./schemas";

export interface TrailerGenerateResult {
  output: TrailerOutput;
  metadata: {
    provider: string;
    validationIssues?: string[];
  };
}

/**
 * Generate trailer prompt metadata using genre-based templates.
 * Returns deterministic output built from the book's genre and keywords.
 */
export async function generateTrailerPrompt(
  request: TrailerGenerateRequest
): Promise<TrailerGenerateResult> {
  const output = buildFallbackOutput(request);
  const validation = validateTrailerOutput(output);

  return {
    output,
    metadata: {
      provider: "template",
      ...(validation.valid ? {} : { validationIssues: validation.issues }),
    },
  };
}

/**
 * Deterministic output built from genre templates.
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
