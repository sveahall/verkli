export type SetupStepStatus = "pending" | "completed" | "skipped";

export type WizardStep =
  | "edit"
  | "cover"
  | "translate"
  | "audiobook"
  | "print"
  | "pricing"
  | "publish";

export const WIZARD_STEPS: WizardStep[] = [
  "edit",
  "cover",
  "translate",
  "audiobook",
  "print",
  "pricing",
  "publish",
];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  edit: "Write",
  cover: "Cover",
  translate: "Translate",
  audiobook: "Audiobook",
  print: "Print",
  pricing: "Pricing",
  publish: "Publish",
};

export const SKIPPABLE_STEPS: Set<WizardStep> = new Set([
  "translate",
  "audiobook",
  "print",
]);

export type BookSetupState = {
  completed: boolean;
  completedAt: string | null;
  steps: Record<WizardStep, SetupStepStatus>;
  translateLanguages: string[];
  audiobookEnabled: boolean;
  printEnabled: boolean;
  publishChoice: "publish" | "draft" | null;
};

export const DEFAULT_SETUP_STATE: BookSetupState = {
  completed: false,
  completedAt: null,
  steps: {
    edit: "pending",
    cover: "pending",
    translate: "pending",
    audiobook: "pending",
    print: "pending",
    pricing: "pending",
    publish: "pending",
  },
  translateLanguages: [],
  audiobookEnabled: false,
  printEnabled: false,
  publishChoice: null,
};

/**
 * Normalize raw setup_state from the database.
 * - null / missing → completed: true (backward-compatible for existing books)
 * - Explicit object → parse and validate
 */
export function normalizeSetupState(raw: unknown): BookSetupState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // No setup state = existing book that predates the wizard → show dashboard
    return {
      ...DEFAULT_SETUP_STATE,
      completed: true,
      steps: {
        edit: "completed",
        cover: "completed",
        translate: "skipped",
        audiobook: "skipped",
        print: "skipped",
        pricing: "completed",
        publish: "completed",
      },
      publishChoice: "publish",
    };
  }

  const data = raw as Record<string, unknown>;

  const parseStepStatus = (value: unknown): SetupStepStatus => {
    if (value === "completed" || value === "skipped") return value;
    return "pending";
  };

  const rawSteps = (typeof data.steps === "object" && data.steps && !Array.isArray(data.steps))
    ? data.steps as Record<string, unknown>
    : {};

  const steps: Record<WizardStep, SetupStepStatus> = {
    edit: parseStepStatus(rawSteps.edit),
    cover: parseStepStatus(rawSteps.cover),
    translate: parseStepStatus(rawSteps.translate),
    audiobook: parseStepStatus(rawSteps.audiobook),
    print: parseStepStatus(rawSteps.print),
    pricing: parseStepStatus(rawSteps.pricing),
    publish: parseStepStatus(rawSteps.publish),
  };

  const translateLanguages = Array.isArray(data.translateLanguages)
    ? (data.translateLanguages as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const publishChoice =
    data.publishChoice === "publish" || data.publishChoice === "draft"
      ? data.publishChoice
      : null;

  return {
    completed: data.completed === true,
    completedAt: typeof data.completedAt === "string" ? data.completedAt : null,
    steps,
    translateLanguages,
    audiobookEnabled: data.audiobookEnabled === true,
    printEnabled: data.printEnabled === true,
    publishChoice,
  };
}

/** Get the first incomplete wizard step (for resuming). */
export function getFirstIncompleteStep(state: BookSetupState): WizardStep {
  for (const step of WIZARD_STEPS) {
    if (state.steps[step] === "pending") return step;
  }
  return "publish";
}

/** Check if all steps are done (completed or skipped). */
export function areAllStepsDone(state: BookSetupState): boolean {
  return WIZARD_STEPS.every((step) => state.steps[step] !== "pending");
}
