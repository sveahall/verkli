"use client";

import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  type BookSetupState,
  type WizardStep,
} from "@/lib/books/setup-state";

type Props = {
  currentStep: WizardStep;
  setupState: BookSetupState;
  onStepClick: (step: WizardStep) => void;
};

export default function SetupStepIndicator({ currentStep, setupState, onStepClick }: Props) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-1 py-2" aria-label="Setup progress">
      {WIZARD_STEPS.map((step, idx) => {
        const status = setupState.steps[step];
        const isCurrent = step === currentStep;
        const isDone = status === "completed";
        const isSkipped = status === "skipped";
        const canNavigate = idx === 0 || setupState.steps[WIZARD_STEPS[idx - 1]] !== "pending";

        return (
          <div key={step} className="flex items-center gap-1">
            {idx > 0 && (
              <div
                className={`h-px w-4 flex-shrink-0 ${
                  isDone || isSkipped ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-200 dark:bg-white/10"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => canNavigate && onStepClick(step)}
              disabled={!canNavigate}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                isCurrent
                  ? "bg-[#907AFF] text-white"
                  : isDone
                    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : isSkipped
                      ? "bg-slate-100 text-slate-400 line-through dark:bg-white/5 dark:text-white/30"
                      : canNavigate
                        ? "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/50 dark:hover:bg-white/10"
                        : "bg-slate-50 text-slate-300 cursor-not-allowed dark:bg-white/[0.03] dark:text-white/20"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isDone && <span className="mr-1">&#10003;</span>}
              {WIZARD_STEP_LABELS[step]}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
