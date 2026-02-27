import type { TrailerGenerateRequest } from "./schemas";
import { GENRE_TEMPLATES } from "./schemas";

// ─── System Prompt ──────────────────────────────────────────────────────────

export function buildTrailerSystemPrompt(): string {
  return [
    "You are a cinematic book-trailer prompt generator for Verkli, a digital book platform.",
    "Your job is to produce structured metadata for a 15-second (3 x 5s scenes) TikTok/Instagram Reels book teaser video.",
    "",
    "Rules:",
    "- Return ONLY valid JSON with this exact shape:",
    '  { "scenes": [ { "visual_prompt": string, "duration": 5 }, { "visual_prompt": string, "duration": 5 }, { "visual_prompt": string, "duration": 5 } ], "caption": string, "hashtags": string[], "title_card": string }',
    "- scenes: Exactly 3 scene objects. Each visual_prompt is a cinematic description for a text-to-video model. Max 40 words per visual_prompt. duration is always 5.",
    "  - Scene 1 (Hook): Arresting opening image that grabs attention in the first second. Bold visuals, mystery, or striking contrast.",
    "  - Scene 2 (Escalation): Build tension or deepen the mood. Introduce movement, shift in lighting, or reveal a new element.",
    "  - Scene 3 (Peak): Emotional or tension climax. The most powerful image — leave the viewer wanting more.",
    "- caption: Social media caption in Swedish. 1-2 sentences. Mention the book title. End with a call to action for Verkli.",
    "- hashtags: Array of 10-20 hashtags. Mix genre-specific, BookTok, and Swedish book community tags. Each must start with #.",
    "- title_card: Short title overlay text. Max 6 words. Include the book title or a shortened version.",
    "",
    "Strict prohibitions:",
    '- NEVER mention AI, machine learning, ChatGPT, or any AI tool in any field.',
    '- NEVER use cringe buzzwords: "game-changer", "revolutionary", "unleash", "supercharge", "synergy", "paradigm shift", "bleeding edge", "next-level", "mind-blowing".',
    "- NEVER include text, watermarks, or logos in any visual_prompt.",
    "- NEVER exceed the word limits.",
    "",
    "Do NOT include any text outside the JSON object.",
  ].join("\n");
}

// ─── User Prompt ────────────────────────────────────────────────────────────

export function buildTrailerUserPrompt(request: TrailerGenerateRequest): string {
  const template = GENRE_TEMPLATES[request.genre];

  const parts = [
    `Boktitel: ${request.title}`,
    `Genre: ${request.genre}`,
    `Beskrivning: ${request.description}`,
    `Nyckelord: ${request.keywords.join(", ")}`,
    `Ton: ${request.tone}`,
    "",
    "Genre-specifik inspiration (använd som kreativ vägledning, inte ordagrant):",
    `- Visuell riktning: ${template.visualDirection}`,
    `- Atmosfär: ${template.atmosphere}`,
    `- Kameraarbete: ${template.cameraWork}`,
    "",
    "Generera trailer-metadata i JSON-format enligt systeminstruktionerna.",
  ];

  return parts.join("\n");
}
