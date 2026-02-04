/**
 * Internal product rules. Not shown to users. Shapes all copy and decisions.
 * Do not export to client unless necessary (error copy only).
 */

// ─── 7. Copy blacklist ─────────────────────────────────────────────────────
// Never allowed in product, website, or emails.

export const COPY_BLACKLIST: string[] = [
  // Startup
  "disrupt", "disrupting", "game-changer", "game changer", "innovative", "launch", "scale", "scaling", "startup", "vision",
  "join us", "join the", "early access", "waitlist", "beta", "coming soon", "stay tuned",
  // Growth
  "growth", "grow", "viral", "leverage", "synergy", "ecosystem", "pivot", "metrics", "funnel", "conversion",
  "sign up", "signup", "get started", "get started today", "start free", "start now",
  // Community
  "community", "tribe", "family", "together", "connect", "network", "belong", "join the community",
  // Friendly
  "hey", "hi there", "hello!", "thanks!", "thank you!", "awesome", "amazing", "love", "happy", "excited", "welcome!",
  "we'd love", "we'd like", "feel free", "don't hesitate", "let us know", "reach out", "happy to help",
  // Reassuring
  "don't worry", "no worries", "rest assured", "you're in good hands", "we've got you", "we're here",
  "try again", "please try again", "something went wrong", "oops", "sorry", "apologies", "unfortunately",
  "need help?", "contact support", "support team", "help center", "get help", "need assistance",
  // Hype
  "!!", "!!!", "best", "ultimate", "revolutionary", "incredible", "unlock", "discover", "transform",
  "exclusive", "limited time", "act now", "don't miss", "last chance",
];

/** Check if text contains any blacklisted phrase (case-insensitive). */
export function copyViolatesBlacklist(text: string): boolean {
  const lower = text.toLowerCase();
  return COPY_BLACKLIST.some((phrase) => lower.includes(phrase.toLowerCase()));
}

// ─── 8. Access logic (internal, one sentence) ────────────────────────────────

export const ACCESS_LOGIC =
  "Access goes first to those who already publish or read in a way the product is built for.";

// ─── 9. Microcopy tone rules (strict) ────────────────────────────────────────

export const MICROCOPY_RULES = [
  "One idea per sentence. One sentence per line when possible.",
  "No exclamation points.",
  "No ellipses for trailing off. Use a full stop or nothing.",
  "Sentence case. No unnecessary capitals. Product name stays as defined.",
  "When in doubt, remove the line. Silence over filler.",
  "No rhetorical questions. No leading questions.",
  "No please. No thank you in UI copy.",
];

// ─── 10. Error state copy (use in UI) ───────────────────────────────────────

export const ERROR_COPY = {
  INVALID_LOGIN: "Invalid login.",
  EXPIRED_ACCESS: "Access expired.",
  REMOVED_ACCESS: "Access removed.",
} as const;

// ─── 11. One line manifesto ─────────────────────────────────────────────────

export const MANIFESTO =
  "A place where writing is published and reading is followed, with no middle layer.";

// ─── 12. Final constraint ──────────────────────────────────────────────────

export const FINAL_CONSTRAINT =
  "If copy feels like it is trying to convince the user, rewrite it until it does not.";

// ─── 13. Founder public language (non-negotiable) ──────────────────────────

export const FOUNDER_PUBLIC_RULES = {
  ALLOWED: [
    "State what the product is. One sentence.",
    "State who it is for. No list. One sentence.",
    "Answer 'what is this' with the manifesto or a single factual sentence. No elaboration.",
    "When asked for more: say only what is true. No pitch. No vision statement.",
  ],
  FORBIDDEN: [
    "Never explain the product in more than one sentence unless asked directly.",
    "Never use marketing language. No benefits, no differentiators, no 'why now'.",
    "Never invite curiosity. Never say 'stay tuned' or 'coming soon' or 'you'll see'.",
    "Never defend, justify, or reassure. Never say 'we believe' or 'we're building'.",
  ],
  CURIOSITY: "When someone is curious: answer the question asked. Nothing more. If the answer is no, say no.",
} as const;

// ─── 14. Screenshot policy ─────────────────────────────────────────────────

export const SCREENSHOT_POLICY = {
  NEVER_VISIBLE: [
    "Real email addresses. Real names. Real content that identifies a person.",
    "Queue position. Waitlist position. Invite order.",
    "Internal labels. Debug state. Feature flags. Environment names.",
    "Error messages that reveal system or security detail.",
  ],
  ACCEPTABLE: [
    "Empty states. Placeholder content. Generic or anonymized data.",
    "Public pages. Access request form. Sign-in form (no credentials).",
    "Navigation and layout. Typography and spacing.",
  ],
  CURIOSITY: "A screenshot may show that something exists. It must not show what it means or how it works.",
} as const;

// ─── 15. Soft denial copy (use in UI when product says no) ────────────────────

export const SOFT_DENIAL_COPY = {
  FEATURE_NOT_AVAILABLE: "Not available.",
  ACTION_NOT_PERMITTED: "Not permitted.",
  ACCESS_RESTRICTED: "Access restricted.",
  NOT_FOUND: "Not found.",
} as const;

// ─── 16. Silence moments (when to say nothing) ──────────────────────────────

export const SILENCE_MOMENTS = [
  "After submission. No confirmation. No gratitude. No next step.",
  "After rejection. No apology. No explanation. No alternative.",
  "After inactivity. No reminder. No nudge. No 'we noticed'.",
  "After removal. No summary. No 'you can still'. No re-entry offer.",
] as const;

// ─── 17. Naming rules ──────────────────────────────────────────────────────

export const NAMING_RULES = [
  "Features: one or two words. The name describes the function. No metaphor.",
  "Pages: the thing the page shows or does. Home. Library. Settings. No cleverness.",
  "States: the state. Draft. Published. Pending. No playful or internal slang.",
  "Access levels: the level. None. Requested. Active. No tier names, no badges.",
  "If a name needs explanation, it is wrong. Names should feel inevitable.",
] as const;

// ─── 18. Public presence constraint ─────────────────────────────────────────

export const PUBLIC_PRESENCE_CONSTRAINT =
  "The product is rarely visible because visibility is not the goal; when it is visible, it is because the moment requires it, and nothing more.";

// ─── 19. Sanity check ──────────────────────────────────────────────────────

export const SANITY_CHECK =
  "If this feels like it wants attention, remove it.";
