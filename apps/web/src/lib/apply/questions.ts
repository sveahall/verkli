/**
 * Round-one beta application — the questionnaire.
 *
 * This file is the single source of truth: it drives the rendered step flow,
 * the server-side validation, and the labels in the admin review list. Changing
 * the questions means editing this file and nothing else — answers are stored
 * as JSON on `beta_applications.answers`, so no migration is needed.
 *
 * A question may carry follow-ups that render on the same step. That is how a
 * compound question ("published before? with whom? in which languages? was
 * there an audiobook?") stays one question from the applicant's point of view
 * while still producing separate, reviewable answers.
 */

export type ApplyQuestionOption = {
  value: string;
  label: string;
};

export type ApplyField = {
  /** Stable key stored in `answers`. Changing it orphans existing answers. */
  id: string;
  label: string;
  help?: string;
  kind: "choice" | "short" | "long" | "url";
  required: boolean;
  options?: ApplyQuestionOption[];
  placeholder?: string;
  maxLength: number;
  /**
   * When present and false, the field is hidden and never stored — so changing
   * an earlier answer discards follow-up text that no longer applies.
   * A conditional field must never be the only thing making a form valid, so
   * hidden fields are skipped by validation entirely.
   */
  showIf?: (answers: Record<string, string>) => boolean;
};

export type ApplyQuestion = ApplyField & {
  followUps?: ApplyField[];
};

const hasPublished = (answers: Record<string, string>) =>
  Boolean(answers.publishing_history) && answers.publishing_history !== "none";

export const APPLY_QUESTIONS: ApplyQuestion[] = [
  {
    id: "bio",
    label: "Who are you, in your own words?",
    help: "A few sentences — the version that belongs on a book jacket, not a CV.",
    kind: "long",
    required: true,
    maxLength: 1200,
  },
  {
    id: "genre",
    label: "What do you write?",
    help: "If your work spans more than one genre, say so.",
    kind: "short",
    required: true,
    maxLength: 300,
    placeholder: "Literary fiction, thriller, memoir…",
  },
  {
    id: "language",
    label: "What language do you write in?",
    help: "List them all if you write in more than one.",
    kind: "short",
    required: true,
    maxLength: 200,
    placeholder: "Swedish, English…",
  },
  {
    id: "publishing_history",
    label: "Have you published before?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { value: "traditional", label: "Yes — with a publishing house" },
      { value: "self", label: "Yes — self-published" },
      { value: "both", label: "Yes — both" },
      { value: "none", label: "Not yet" },
    ],
    followUps: [
      {
        id: "published_work",
        label: "What have you published?",
        help: "Titles, the publisher if there was one, which languages it came out in, and whether any of it became an audiobook.",
        kind: "long",
        required: true,
        maxLength: 1500,
        showIf: hasPublished,
      },
      {
        id: "published_work_url",
        label: "A link, if there is one",
        help: "A store page, your own site, anywhere it lives.",
        kind: "url",
        required: false,
        maxLength: 500,
        placeholder: "https://",
        showIf: hasPublished,
      },
    ],
  },
  {
    id: "readership",
    label: "How many people follow your writing?",
    help: "Social media, a newsletter, anywhere at all. An estimate is fine — round one is not decided on audience size.",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { value: "none", label: "No following yet" },
      { value: "under_1k", label: "Under 1,000" },
      { value: "1k_10k", label: "1,000–10,000" },
      { value: "10k_100k", label: "10,000–100,000" },
      { value: "over_100k", label: "More than 100,000" },
    ],
    followUps: [
      {
        id: "readership_where",
        label: "Where?",
        kind: "short",
        required: false,
        maxLength: 300,
        placeholder: "Instagram, Substack, a newsletter…",
        showIf: (answers) =>
          Boolean(answers.readership) && answers.readership !== "none",
      },
    ],
  },
  {
    id: "manuscript_status",
    label: "Do you have a manuscript you’d want to publish with us?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { value: "ready", label: "Yes — finished and ready" },
      { value: "nearly", label: "Yes — nearly finished" },
      { value: "drafting", label: "Yes — still drafting" },
      { value: "idea", label: "Not yet — it’s still an idea" },
    ],
    followUps: [
      {
        id: "manuscript_about",
        label: "Tell us about it",
        help: "What it’s about, roughly how long, and what state it’s in. If it doesn’t sit neatly in any category, this is the place to say so.",
        kind: "long",
        required: true,
        maxLength: 2000,
      },
      {
        id: "manuscript_rights",
        label: "Do you hold the publishing rights?",
        help: "If it’s under contract with a publisher we may not be able to publish it — better to know now than after you’ve been accepted.",
        kind: "choice",
        required: true,
        maxLength: 40,
        options: [
          { value: "yes", label: "Yes, the rights are mine" },
          { value: "partly", label: "Partly — some territories or formats are taken" },
          { value: "no", label: "No, they’re with a publisher" },
          { value: "unsure", label: "I’m not sure" },
        ],
        showIf: (answers) => answers.manuscript_status !== "idea",
      },
    ],
  },
];

/** Every field of a question that currently applies, in render order. */
export function visibleFields(
  question: ApplyQuestion,
  answers: Record<string, string>
): ApplyField[] {
  const fields: ApplyField[] = [question];
  for (const followUp of question.followUps ?? []) {
    if (!followUp.showIf || followUp.showIf(answers)) fields.push(followUp);
  }
  return fields;
}

export type ApplyAnswers = Record<string, string>;

export type AnswerValidationResult =
  | { ok: true; answers: ApplyAnswers }
  | { ok: false; fieldId: string };

function validateField(
  field: ApplyField,
  raw: Record<string, unknown>
): { ok: true; value: string | null } | { ok: false } {
  const value = raw[field.id];
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) return field.required ? { ok: false } : { ok: true, value: null };
  if (text.length > field.maxLength) return { ok: false };

  if (field.kind === "choice") {
    const allowed = (field.options ?? []).some((o) => o.value === text);
    if (!allowed) return { ok: false };
  }

  if (field.kind === "url" && !/^https?:\/\//i.test(text)) return { ok: false };

  return { ok: true, value: text };
}

/**
 * Validates a raw `answers` object against APPLY_QUESTIONS.
 *
 * Deliberately strict: unknown keys are dropped rather than stored, so a
 * crafted POST cannot bloat the row with arbitrary JSON. Follow-ups are
 * evaluated against the answers as submitted, so a hidden follow-up is neither
 * required nor kept.
 */
export function validateAnswers(input: unknown): AnswerValidationResult {
  const raw: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  // Choice answers gate the follow-ups, so resolve them against the submitted
  // values rather than the partially built result.
  const submitted: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") submitted[key] = value.trim();
  }

  const answers: ApplyAnswers = {};

  for (const question of APPLY_QUESTIONS) {
    for (const field of visibleFields(question, submitted)) {
      const result = validateField(field, raw);
      if (!result.ok) return { ok: false, fieldId: field.id };
      if (result.value !== null) answers[field.id] = result.value;
    }
  }

  return { ok: true, answers };
}

/** Flat list of every field, for rendering stored answers in the admin list. */
export function allFields(): ApplyField[] {
  return APPLY_QUESTIONS.flatMap((question) => [
    question,
    ...(question.followUps ?? []),
  ]);
}

/** Human-readable answer for the admin review list. */
export function formatAnswer(field: ApplyField, value: string): string {
  if (field.kind !== "choice") return value;
  return field.options?.find((o) => o.value === value)?.label ?? value;
}
