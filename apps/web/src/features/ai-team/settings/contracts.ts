import { z } from "zod";

/**
 * Account-wide AI preferences.
 *
 * Two kinds of field live here and they are NOT interchangeable:
 *
 *  - Choices (`replyStyle`, the four traits, the two switches) are closed
 *    enums. The server turns them into its own sentences, so they are safe to
 *    place in the system prompt.
 *  - Free text (`nickname`, `craft`, `about`, `instructions`) is whatever the
 *    author typed. It goes into the *user* prompt as untrusted data, next to
 *    saved preferences. "Custom instructions" being called instructions does
 *    not make them system instructions — see prompt.ts.
 */
export const AI_REPLY_STYLES = ["default", "concise", "friendly", "candid", "encouraging"] as const;
export type AiReplyStyle = (typeof AI_REPLY_STYLES)[number];

export const AI_TRAIT_LEVELS = ["less", "standard", "more"] as const;
export type AiTraitLevel = (typeof AI_TRAIT_LEVELS)[number];

export const AI_TRAITS = ["warmth", "enthusiasm", "structure", "emoji"] as const;
export type AiTrait = (typeof AI_TRAITS)[number];

export const MAX_NICKNAME_CHARS = 60;
export const MAX_CRAFT_CHARS = 120;
export const MAX_ABOUT_CHARS = 600;
export const MAX_INSTRUCTIONS_CHARS = 1500;

export type AiSettings = {
  /** Master switch. False hides every AI surface and blocks every AI route. */
  aiEnabled: boolean;
  /** Whether saved preferences (ai_memories) are sent with each request. */
  memoryEnabled: boolean;
  replyStyle: AiReplyStyle;
  warmth: AiTraitLevel;
  enthusiasm: AiTraitLevel;
  structure: AiTraitLevel;
  emoji: AiTraitLevel;
  matchWritingVoice: boolean;
  nickname: string;
  craft: string;
  about: string;
  instructions: string;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  aiEnabled: true,
  memoryEnabled: true,
  replyStyle: "default",
  warmth: "standard",
  enthusiasm: "standard",
  structure: "standard",
  emoji: "standard",
  matchWritingVoice: false,
  nickname: "",
  craft: "",
  about: "",
  instructions: "",
};

/**
 * Trim, then collapse blank to "". The database stores NULL for "not set"; the
 * app stores "". Keeping one empty representation in the app means the prompt
 * builder and the form only ever test truthiness.
 */
const text = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

const traitLevel = z.enum(AI_TRAIT_LEVELS);

export const aiSettingsSchema = z
  .object({
    aiEnabled: z.boolean(),
    memoryEnabled: z.boolean(),
    replyStyle: z.enum(AI_REPLY_STYLES),
    warmth: traitLevel,
    enthusiasm: traitLevel,
    structure: traitLevel,
    emoji: traitLevel,
    matchWritingVoice: z.boolean(),
    nickname: text(MAX_NICKNAME_CHARS),
    craft: text(MAX_CRAFT_CHARS),
    // `about` and `instructions` keep their newlines: they are prose the
    // author wrote in a textarea, and flattening them loses list structure.
    about: z.string().transform((value) => value.trim()).pipe(z.string().max(MAX_ABOUT_CHARS)),
    instructions: z.string().transform((value) => value.trim()).pipe(z.string().max(MAX_INSTRUCTIONS_CHARS)),
  })
  .strict();

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

/** Read the settings section out of the shared author-settings form. */
export function parseAiSettingsForm(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "");
  const flag = (name: string) => field(name) === "true";
  return aiSettingsSchema.safeParse({
    aiEnabled: flag("ai_enabled"),
    memoryEnabled: flag("ai_memory_enabled"),
    replyStyle: field("ai_reply_style") || DEFAULT_AI_SETTINGS.replyStyle,
    warmth: field("ai_warmth") || DEFAULT_AI_SETTINGS.warmth,
    enthusiasm: field("ai_enthusiasm") || DEFAULT_AI_SETTINGS.enthusiasm,
    structure: field("ai_structure") || DEFAULT_AI_SETTINGS.structure,
    emoji: field("ai_emoji") || DEFAULT_AI_SETTINGS.emoji,
    matchWritingVoice: flag("ai_match_writing_voice"),
    nickname: field("ai_nickname"),
    craft: field("ai_craft"),
    about: field("ai_about"),
    instructions: field("ai_instructions"),
  });
}
