/**
 * Single source of truth for the investor-pitch social distribution demo.
 *
 * Both the static SVG thumbnail generator
 * (scripts/generate-demo-social-thumbs.ts) and the in-app DistributionFacade
 * consume this module so the grid thumbnails, the preview modal, and the
 * generated artwork never drift apart.
 *
 * Pure data only — no React, no Node, no DB. Safe to import from a client
 * component AND from a plain `tsx` build script.
 */

// ── Channels ───────────────────────────────────────────────────────────────
// Order is meaningful: it drives the row order in the façade and the
// channel-by-channel pacing window in useDemoDistribution.
export const DEMO_CHANNELS = [
  "tiktok",
  "instagram",
  "x",
  "threads",
  "youtube",
] as const;
export type DemoChannel = (typeof DEMO_CHANNELS)[number];

// The 3 launch languages shown in the distribution grid.
export const DEMO_DISTRIBUTION_LANGUAGES = ["sv", "en", "fr"] as const;
export type DemoDistributionLanguage = (typeof DEMO_DISTRIBUTION_LANGUAGES)[number];

// Each channel renders as one of three native post formats.
export type SocialPostType = "video" | "image" | "text";

export interface ChannelMeta {
  label: string;
  /** Native post format — drives which template + chrome we render. */
  type: SocialPostType;
  /** Account handle as it appears in the native post header. */
  handle: string;
  /** Native artwork aspect ratio. */
  aspect: "vertical" | "square" | "wide";
  /** Native artwork pixel size (used by the SVG generator). */
  width: number;
  height: number;
}

export const CHANNEL_META: Record<DemoChannel, ChannelMeta> = {
  tiktok: {
    label: "TikTok",
    type: "video",
    handle: "@verkli",
    aspect: "vertical",
    width: 1080,
    height: 1920,
  },
  instagram: {
    label: "Instagram",
    type: "image",
    handle: "@verkli.books",
    aspect: "square",
    width: 1080,
    height: 1080,
  },
  x: {
    label: "X",
    type: "text",
    handle: "@verkli",
    aspect: "wide",
    width: 1200,
    height: 675,
  },
  threads: {
    label: "Threads",
    type: "text",
    handle: "@verkli.books",
    aspect: "wide",
    width: 1200,
    height: 675,
  },
  youtube: {
    label: "YouTube Shorts",
    type: "video",
    handle: "@verkli",
    aspect: "vertical",
    width: 1080,
    height: 1920,
  },
};

// ── Per-language book facts ──────────────────────────────────────────────────
export interface BookLangFacts {
  title: string;
  byline: string;
  cta: string;
}

export const BOOK_BY_LANG: Record<DemoDistributionLanguage, BookLangFacts> = {
  sv: { title: "Den hemsökta dagboken", byline: "av Astrid Halvorsen", cta: "Lyssna gratis" },
  en: { title: "The Haunted Diary", byline: "by Astrid Halvorsen", cta: "Listen free" },
  fr: { title: "Le journal hanté", byline: "par Astrid Halvorsen", cta: "Écouter" },
};

// ── The posts ────────────────────────────────────────────────────────────────
export interface PostMetrics {
  likes: number;
  comments: number;
  shares: number;
  /** Only meaningful for video posts. */
  views?: number;
}

export interface DemoSocialPost {
  channel: DemoChannel;
  language: DemoDistributionLanguage;
  type: SocialPostType;
  label: string;
  handle: string;
  displayName: string;
  title: string;
  byline: string;
  caption: string;
  hashtags: string[];
  cta: string;
  /** mm:ss for video posts. */
  durationLabel?: string;
  /** Pull-quote rendered on image posts. */
  quote?: string;
  metrics: PostMetrics;
}

const DISPLAY_NAME = "Verkli";

// Per-channel caption voice, keyed by language. Written to read like a real
// launch — hook-driven on video, evocative on image, punchy on text.
const CAPTIONS: Record<DemoChannel, Record<DemoDistributionLanguage, string>> = {
  tiktok: {
    sv: "POV: du öppnar en dagbok som aldrig var menad att läsas. 🕯️ Kapitel ett är ute — och det blir värre.",
    en: "POV: you open a diary that was never meant to be read. 🕯️ Chapter one is live — and it only gets worse.",
    fr: "POV : tu ouvres un journal qui n'aurait jamais dû être lu. 🕯️ Le premier chapitre est en ligne — et ça empire.",
  },
  instagram: {
    sv: "Vissa sidor viskar tillbaka. ”Den hemsökta dagboken” av Astrid Halvorsen — nu inläst på 10 språk. 🕯️🖤",
    en: "Some pages whisper back. “The Haunted Diary” by Astrid Halvorsen — now narrated in 10 languages. 🕯️🖤",
    fr: "Certaines pages murmurent en retour. « Le journal hanté » d'Astrid Halvorsen — désormais narré en 10 langues. 🕯️🖤",
  },
  x: {
    sv: "En dagbok som vägrar tystna. ”Den hemsökta dagboken” finns nu som ljudbok på 10 språk — första kapitlet är gratis.",
    en: "A diary that refuses to fall silent. “The Haunted Diary” is now an audiobook in 10 languages — chapter one is free.",
    fr: "Un journal qui refuse de se taire. « Le journal hanté » est maintenant un livre audio en 10 langues — le premier chapitre est gratuit.",
  },
  threads: {
    sv: "Vi släppte precis ”Den hemsökta dagboken” som inläst ljudbok på 10 språk — samma dag, alla marknader. Första kapitlet är gratis om du gillar kalla nätter. 🕯️",
    en: "We just launched “The Haunted Diary” as a narrated audiobook in 10 languages — same day, every market. Chapter one is free if you like your nights a little colder. 🕯️",
    fr: "On vient de lancer « Le journal hanté » en livre audio dans 10 langues — le même jour, partout. Le premier chapitre est gratuit si vous aimez les nuits plus froides. 🕯️",
  },
  youtube: {
    sv: "Den hemsökta dagboken — Kapitel 1 (hela ljudet). En dagbok som vägrar tystna.",
    en: "The Haunted Diary — Chapter 1 (full audio). A diary that refuses to stay silent.",
    fr: "Le journal hanté — Chapitre 1 (audio complet). Un journal qui refuse de se taire.",
  },
};

const HASHTAGS: Record<DemoChannel, string[]> = {
  tiktok: ["#BookTok", "#gothic", "#audiobook", "#hauntedDiary", "#verkli"],
  instagram: ["#bookstagram", "#gothic", "#audiobook", "#darkacademia", "#verkli"],
  x: ["#audiobook", "#gothicfiction", "#verkli"],
  threads: ["#booklovers", "#audiobook", "#verkli"],
  youtube: ["#shorts", "#audiobook", "#gothicfiction", "#verkli"],
};

const QUOTES: Record<DemoDistributionLanguage, string> = {
  sv: "”Jag svär att jag stängde den. På morgonen låg den öppen igen.”",
  en: "“I swear I closed it. By morning it lay open again.”",
  fr: "« Je jure l'avoir refermé. Au matin, il était de nouveau ouvert. »",
};

const DURATION: Record<DemoChannel, string | undefined> = {
  tiktok: "0:48",
  instagram: undefined,
  x: undefined,
  threads: undefined,
  youtube: "0:59",
};

// Base engagement per channel, scaled by language weight so EN reads as the
// largest market without any of the numbers looking templated.
const BASE_METRICS: Record<DemoChannel, PostMetrics> = {
  tiktok: { likes: 14200, comments: 312, shares: 1840, views: 128400 },
  instagram: { likes: 9240, comments: 187, shares: 643 },
  x: { likes: 842, comments: 56, shares: 213 },
  threads: { likes: 1120, comments: 98, shares: 142 },
  youtube: { likes: 5100, comments: 204, shares: 870, views: 86300 },
};

const LANG_WEIGHT: Record<DemoDistributionLanguage, number> = {
  en: 1,
  sv: 0.62,
  fr: 0.74,
};

function scaleMetrics(base: PostMetrics, weight: number): PostMetrics {
  const round = (n: number) => {
    const scaled = n * weight;
    // Round to a "natural" precision so big numbers don't end in noise.
    if (scaled >= 10000) return Math.round(scaled / 100) * 100;
    if (scaled >= 1000) return Math.round(scaled / 10) * 10;
    return Math.round(scaled);
  };
  return {
    likes: round(base.likes),
    comments: round(base.comments),
    shares: round(base.shares),
    ...(base.views != null ? { views: round(base.views) } : {}),
  };
}

function buildPost(channel: DemoChannel, language: DemoDistributionLanguage): DemoSocialPost {
  const meta = CHANNEL_META[channel];
  const book = BOOK_BY_LANG[language];
  return {
    channel,
    language,
    type: meta.type,
    label: meta.label,
    handle: meta.handle,
    displayName: DISPLAY_NAME,
    title: book.title,
    byline: book.byline,
    caption: CAPTIONS[channel][language],
    hashtags: HASHTAGS[channel],
    cta: book.cta,
    durationLabel: DURATION[channel],
    quote: meta.type === "image" ? QUOTES[language] : undefined,
    metrics: scaleMetrics(BASE_METRICS[channel], LANG_WEIGHT[language]),
  };
}

/** key = `${channel}:${language}` */
export const DEMO_SOCIAL_POSTS: Record<string, DemoSocialPost> = (() => {
  const map: Record<string, DemoSocialPost> = {};
  for (const channel of DEMO_CHANNELS) {
    for (const language of DEMO_DISTRIBUTION_LANGUAGES) {
      map[`${channel}:${language}`] = buildPost(channel, language);
    }
  }
  return map;
})();

export function getDemoSocialPost(
  channel: DemoChannel,
  language: DemoDistributionLanguage
): DemoSocialPost {
  return DEMO_SOCIAL_POSTS[`${channel}:${language}`];
}

export const DEMO_POST_COUNT = DEMO_CHANNELS.length * DEMO_DISTRIBUTION_LANGUAGES.length;

/** Compact metric formatter — 128400 → "128.4K". */
export function formatMetric(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
