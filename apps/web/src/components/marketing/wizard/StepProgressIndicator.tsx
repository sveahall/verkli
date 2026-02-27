"use client";

import {
  WIZARD_STEP_META,
  WIZARD_STEP_ORDER,
} from "@/components/marketing/wizard/wizard-machine";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";

export default function StepProgressIndicator() {
  const { state, isStepAllowed, goToStep } = useTrailerWizard();
  const activeIndex = WIZARD_STEP_ORDER.indexOf(state.step);

  return (
    <nav aria-label="Marketing wizard progress" className="card-base p-4">
      <ol className="grid gap-2 sm:grid-cols-5">
        {WIZARD_STEP_ORDER.map((step, index) => {
          const meta = WIZARD_STEP_META[step];
          const isActive = step === state.step;
          const isDone = index < activeIndex;
          const isAllowed = isStepAllowed(step);

          const className = isActive
            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
            : isDone
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/20 dark:text-emerald-300"
              : isAllowed
                ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/20"
                : "border-slate-200/70 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/35";

          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => goToStep(step)}
                disabled={!isAllowed}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${className}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Steg {index + 1}
                </p>
                <p className="mt-1 text-[13px] font-semibold">{meta.title}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
