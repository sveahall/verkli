import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from "@/lib/languages";

const COMMON_WORDS: Record<SupportedLanguage, string[]> = {
  en: ["the", "and", "to", "of", "in", "that", "it", "is", "was", "for", "with"],
  es: ["el", "la", "los", "las", "y", "que", "de", "no", "una", "para", "con"],
  fr: ["le", "la", "les", "et", "est", "pas", "une", "des", "que", "je", "dans"],
  de: ["und", "der", "die", "das", "nicht", "ich", "ein", "mit", "ist", "zu", "auf"],
  it: ["il", "lo", "la", "gli", "le", "e", "che", "non", "una", "per", "con"],
  pt: ["o", "a", "os", "as", "e", "de", "que", "não", "para", "uma", "com"],
  sv: ["och", "det", "att", "som", "inte", "är", "en", "ett", "på", "med", "för", "har"],
  ru: ["и", "в", "не", "на", "что", "он", "как", "это", "она", "по", "но"],
  zh: [],
  ja: [],
  ko: [],
  ar: ["في", "من", "على", "إلى", "أن", "هذا", "التي", "التي", "كان", "لا", "ما"],
};

const WORD_SETS: Record<SupportedLanguage, Set<string>> = SUPPORTED_LANGUAGE_CODES.reduce(
  (acc, code) => {
    acc[code] = new Set(COMMON_WORDS[code]);
    return acc;
  },
  {} as Record<SupportedLanguage, Set<string>>
);

const CHAR_HINTS: Partial<Record<SupportedLanguage, RegExp>> = {
  sv: /[åäö]/g,
  de: /[ßäöü]/g,
  fr: /[àâçéèêëîïôûù]/g,
  es: /[ñáéíóúü¿¡]/g,
  pt: /[ãõçáéíóú]/g,
  it: /[àèéìíîòóù]/g,
  ru: /[\u0400-\u04FF]/g,
  zh: /[\u4E00-\u9FFF]/g,
  ja: /[\u3040-\u309F\u30A0-\u30FF]/g,
  ko: /[\uAC00-\uD7AF\u1100-\u11FF]/g,
  ar: /[\u0600-\u06FF]/g,
};

const MIN_TOKEN_COUNT = 8;
const MIN_SCORE = 3;
const MIN_MARGIN = 2;

function scoreLanguages(text: string): Array<{ code: SupportedLanguage; score: number }> | null {
  if (!text) return null;
  const sample = text.slice(0, 4000).toLowerCase();
  const tokens = sample.match(/[a-z\u00C0-\u017F]+/g) ?? [];
  if (tokens.length < MIN_TOKEN_COUNT) return null;

  const scores = SUPPORTED_LANGUAGE_CODES.reduce(
    (acc, code) => {
      acc[code] = 0;
      return acc;
    },
    {} as Record<SupportedLanguage, number>
  );

  for (const token of tokens) {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      if (WORD_SETS[code].has(token)) {
        scores[code] += 1;
      }
    }
  }

  for (const code of SUPPORTED_LANGUAGE_CODES) {
    const hint = CHAR_HINTS[code];
    if (!hint) continue;
    const matches = sample.match(hint);
    if (matches) {
      scores[code] += matches.length * 2;
    }
  }

  return SUPPORTED_LANGUAGE_CODES
    .map((code) => ({ code, score: scores[code] }))
    .sort((a, b) => b.score - a.score);
}

export function detectLanguageFromText(text: string): SupportedLanguage | null {
  const ranked = scoreLanguages(text);
  if (!ranked) return null;

  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top || top.score < MIN_SCORE) return null;
  if (runnerUp && top.score - runnerUp.score < MIN_MARGIN) return null;
  return top.code;
}

export function detectLanguageWithConfidence(text: string): {
  language: SupportedLanguage | null;
  confidence: number;
} {
  const ranked = scoreLanguages(text);
  if (!ranked) return { language: null, confidence: 0 };

  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top || top.score < MIN_SCORE) return { language: null, confidence: 0 };

  const combined = top.score + (runnerUp?.score ?? 0);
  const confidence = combined > 0 ? top.score / combined : 0;
  return { language: top.code, confidence };
}

