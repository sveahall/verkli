import { z } from "zod";
import { countWords as _countWords } from "@/lib/tiptap-content";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const TrailerGenreSchema = z.enum([
  "romance",
  "fantasy",
  "thriller",
  "ya",
  "literary",
  "biography",
]);
export type TrailerGenre = z.infer<typeof TrailerGenreSchema>;

export const TrailerToneSchema = z.enum([
  "dark",
  "dreamy",
  "intense",
  "whimsical",
  "melancholic",
  "suspenseful",
  "passionate",
  "epic",
]);
export type TrailerTone = z.infer<typeof TrailerToneSchema>;

// ─── Request / Output schemas ───────────────────────────────────────────────

export const TrailerGenerateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  genre: TrailerGenreSchema,
  description: z.string().min(1).max(2000),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
  tone: TrailerToneSchema,
  audio: z.boolean().optional().default(true),
});
export type TrailerGenerateRequest = z.infer<typeof TrailerGenerateRequestSchema>;

export const TrailerSceneSchema = z.object({
  visual_prompt: z.string(),
  duration: z.literal(5),
});
export type TrailerScene = z.infer<typeof TrailerSceneSchema>;

export const TrailerOutputSchema = z.object({
  scenes: z.array(TrailerSceneSchema).length(3),
  caption: z.string(),
  hashtags: z.array(z.string()),
  title_card: z.string(),
});
export type TrailerOutput = z.infer<typeof TrailerOutputSchema>;

// ─── Genre Templates ────────────────────────────────────────────────────────

export interface GenreTemplate {
  visualDirection: string;
  atmosphere: string;
  cameraWork: string;
  negativeDefaults: string;
  hashtagPool: string[];
  titleCardPattern: string;
  captionPattern: string;
}

export const GENRE_TEMPLATES: Record<TrailerGenre, GenreTemplate> = {
  romance: {
    visualDirection:
      "Soft golden-hour lighting, close-ups of intertwined hands, silhouettes against sunset, flowing fabrics in wind, bokeh fairy lights",
    atmosphere:
      "Warm, intimate, tender, longing glances, candlelit ambience",
    cameraWork:
      "Slow dolly-in, shallow depth of field, gentle rack focus between faces, smooth tracking along shoreline",
    negativeDefaults:
      "violence gore blood weapons horror darkness scary monsters text watermark logo cartoon anime",
    hashtagPool: [
      "#BookTok", "#RomanceBooks", "#LoveStory", "#BookTrailer",
      "#RomanceReads", "#SwoonWorthy", "#BookishLove", "#RomanceBookTok",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#LoveToRead",
      "#RomanticReads", "#BookLovers", "#HeartMelting", "#BookCommunity",
      "#ReadingList", "#BookAddict", "#FavoriteRomance", "#BookishVibes",
    ],
    titleCardPattern: "{title} — en kärlekshistoria",
    captionPattern: "Kärleken som förändrar allt. {title} finns nu på Verkli.",
  },
  fantasy: {
    visualDirection:
      "Ethereal mist over ancient forests, glowing runes, sweeping aerial shots of mountain kingdoms, enchanted artifacts pulsing with light",
    atmosphere:
      "Mystical, awe-inspiring, otherworldly, ancient magic awakening",
    cameraWork:
      "Epic crane shots, slow-motion spell effects, sweeping landscape reveals, dramatic push-in on magical objects",
    negativeDefaults:
      "modern buildings cars phones technology urban text watermark logo cartoon low-quality blurry",
    hashtagPool: [
      "#BookTok", "#FantasyBooks", "#EpicFantasy", "#BookTrailer",
      "#FantasyReads", "#MagicBooks", "#BookishFantasy", "#DarkFantasy",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#FantasyWorld",
      "#BookLovers", "#SwordAndSorcery", "#FantasyBookTok", "#BookCommunity",
      "#MagicalReads", "#WorldBuilding", "#ReadingList", "#EpicReads",
    ],
    titleCardPattern: "{title} — en fantasyresa",
    captionPattern: "Magin vaknar. {title} tar dig till en annan värld.",
  },
  thriller: {
    visualDirection:
      "Rain-slicked streets at night, harsh neon reflections, extreme close-ups of anxious eyes, shadowy figures in doorways, flickering fluorescent lights",
    atmosphere:
      "Tense, claustrophobic, paranoid, heart-pounding suspense, danger lurking",
    cameraWork:
      "Handheld shaky cam, rapid cuts, dutch angles, whip pans through dark corridors, slow zoom on evidence",
    negativeDefaults:
      "bright cheerful sunshine flowers comedy cute cartoon text watermark logo anime childish",
    hashtagPool: [
      "#BookTok", "#ThrillerBooks", "#PageTurner", "#BookTrailer",
      "#ThrillerReads", "#Suspense", "#CrimeFiction", "#DarkThriller",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#CantPutItDown",
      "#MysteryBooks", "#BookLovers", "#ThrillerBookTok", "#BookCommunity",
      "#PsychologicalThriller", "#ReadingList", "#TwistyThriller", "#GrippingRead",
    ],
    titleCardPattern: "{title} — sanningen har ett pris",
    captionPattern: "Ingen är säker. {title} — en thriller du inte kan lägga ner.",
  },
  ya: {
    visualDirection:
      "Vibrant color grading, golden afternoon light in school hallways, rooftop views of city skyline, polaroid photo aesthetic, autumn leaves falling",
    atmosphere:
      "Nostalgic, hopeful, bittersweet, coming-of-age energy, first-time wonder",
    cameraWork:
      "Smooth steadicam following protagonist, time-lapse of changing seasons, gentle slow-motion laughter, reflective mirror shots",
    negativeDefaults:
      "violence gore blood horror scary adult-content explicit text watermark logo cartoon low-quality",
    hashtagPool: [
      "#BookTok", "#YABooks", "#YoungAdult", "#BookTrailer",
      "#YAReads", "#TeenBooks", "#ComingOfAge", "#YABookTok",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#BookLovers",
      "#YAFiction", "#BookCommunity", "#TeenReads", "#ReadingList",
      "#BookishVibes", "#YAFantasy", "#YARomance", "#FirstLove",
    ],
    titleCardPattern: "{title} — allt förändras",
    captionPattern: "En berättelse om att hitta sig själv. {title} på Verkli.",
  },
  literary: {
    visualDirection:
      "Muted color palette, still-life compositions, morning fog over quiet landscapes, weathered textures of old books and letters, reflections in rain puddles",
    atmosphere:
      "Contemplative, melancholic beauty, quiet intensity, existential weight",
    cameraWork:
      "Static long takes, slow pan across empty rooms, macro shots of handwritten text, minimal camera movement with deep focus",
    negativeDefaults:
      "action explosions flashy neon loud cartoon anime text watermark logo superhero fast-paced",
    hashtagPool: [
      "#BookTok", "#LiteraryFiction", "#BookTrailer", "#BookLovers",
      "#LiteraryReads", "#BeautifulWriting", "#BookishVibes", "#SlowReading",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#BookCommunity",
      "#ReadingList", "#Prose", "#LiteraryBookTok", "#AwardWinning",
      "#Thoughtful", "#BookClub", "#DeepReads", "#QuietBooks",
    ],
    titleCardPattern: "{title} — en roman",
    captionPattern: "Ord som stannar kvar. Upptäck {title} på Verkli.",
  },
  biography: {
    visualDirection:
      "Documentary-style footage, archival photography transitions, portrait lighting, urban landscapes, milestone moments, dramatic black and white to color transitions",
    atmosphere:
      "Authentic, inspiring, determined, real-world achievement, human resilience",
    cameraWork:
      "Ken Burns-style pan across photos, steady tracking shots through city streets, intimate medium close-ups, time-lapse of changing eras",
    negativeDefaults:
      "fantasy magic swords cartoon anime fiction supernatural text watermark logo childish low-quality",
    hashtagPool: [
      "#BookTok", "#Biography", "#TrueStory", "#BookTrailer",
      "#NonFiction", "#Inspiration", "#RealLife", "#BiographyBooks",
      "#NewRelease", "#MustRead", "#BookRecommendation", "#BookCommunity",
      "#LifeStory", "#BookLovers", "#BiographyBookTok", "#ReadingList",
      "#InspirationalBooks", "#Memoir", "#RealStory", "#MotivationalReads",
    ],
    titleCardPattern: "{title} — en sann historia",
    captionPattern: "En berättelse som inspirerar. Upptäck {title} på Verkli.",
  },
};

// ─── Validation ─────────────────────────────────────────────────────────────

const BANNED_TERMS = [
  "ai-generated",
  "ai generated",
  "artificial intelligence",
  "machine learning",
  "neural network",
  "deep learning",
  "chatgpt",
  "midjourney",
  "dall-e",
  "stable diffusion",
  "game-changer",
  "disrupting",
  "revolutionary",
  "unleash",
  "supercharge",
  "synergy",
  "paradigm shift",
  "bleeding edge",
  "next-level",
  "mind-blowing",
];

export const countWords = _countWords;

export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateTrailerOutput(output: TrailerOutput): ValidationResult {
  const issues: string[] = [];

  if (output.scenes.length !== 3) {
    issues.push(`scenes has ${output.scenes.length} items (must be exactly 3)`);
  }

  for (let i = 0; i < output.scenes.length; i++) {
    const words = countWords(output.scenes[i].visual_prompt);
    if (words > 40) {
      issues.push(`scenes[${i}].visual_prompt has ${words} words (max 40)`);
    }
  }

  const titleWords = countWords(output.title_card);
  if (titleWords > 6) {
    issues.push(`title_card has ${titleWords} words (max 6)`);
  }

  if (output.hashtags.length < 10) {
    issues.push(`hashtags has ${output.hashtags.length} items (min 10)`);
  }
  if (output.hashtags.length > 20) {
    issues.push(`hashtags has ${output.hashtags.length} items (max 20)`);
  }

  const allText = [
    ...output.scenes.map((s) => s.visual_prompt),
    output.caption,
    output.title_card,
    ...output.hashtags,
  ]
    .join(" ")
    .toLowerCase();

  for (const term of BANNED_TERMS) {
    if (allText.includes(term)) {
      issues.push(`contains banned term: "${term}"`);
    }
  }

  return { valid: issues.length === 0, issues };
}
