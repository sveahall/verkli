export {
  TrailerGenreSchema,
  TrailerToneSchema,
  TrailerSceneSchema,
  TrailerGenerateRequestSchema,
  TrailerOutputSchema,
  GENRE_TEMPLATES,
  validateTrailerOutput,
  countWords,
  truncateWords,
} from "./schemas";

export type {
  TrailerGenre,
  TrailerTone,
  TrailerScene,
  TrailerGenerateRequest,
  TrailerOutput,
  GenreTemplate,
  ValidationResult,
} from "./schemas";

export { buildTrailerSystemPrompt, buildTrailerUserPrompt } from "./prompt-templates";

export { generateTrailerPrompt } from "./generate";
export type { TrailerGenerateResult } from "./generate";
