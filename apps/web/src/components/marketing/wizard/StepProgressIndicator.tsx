"use client";

import {
  WIZARD_STEP_META,
  WIZARD_STEP_ORDER,
} from "@/components/marketing/wizard/wizard-machine";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StepProgressIndicator() {
  const { state, isStepAllowed, goToStep } = useTrailerWizard();
  const activeIndex = WIZARD_STEP_ORDER.indexOf(state.step);

  return (
    <nav aria-label="Marketing wizard progress" className="card-base p-4">
      <ol className="grid gap-2 sm:grid-cols-3">
        {WIZARD_STEP_ORDER.map((step, index) => {
          const meta = WIZARD_STEP_META[step];
          const isActive = step === state.step;
          const isDone = index < activeIndex;
          const isAllowed = isStepAllowed(step);

          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => goToStep(step)}
                disabled={!isAllowed}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : isDone
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                      : isAllowed
                        ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/20"
                        : "border-slate-200/70 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/35"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                    isActive
                      ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                      : isDone
                        ? "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950"
                        : "bg-slate-200/80 text-slate-500 dark:bg-white/10 dark:text-white/40"
                  }`}
                >
                  {isDone ? <CheckIcon /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{meta.title}</p>
                  <p className="mt-0.5 truncate text-[11px] opacity-60">
                    {meta.description}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
