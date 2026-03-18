"use client";

import Link from "next/link";
import StepErrorBoundary from "@/components/marketing/wizard/StepErrorBoundary";
import StepProgressIndicator from "@/components/marketing/wizard/StepProgressIndicator";
import WizardPreviewPanel from "@/components/marketing/wizard/WizardPreviewPanel";
import {
  TrailerWizardProvider,
  useTrailerWizard,
} from "@/components/marketing/wizard/WizardContext";
import StepSelectBook from "@/components/marketing/wizard/steps/StepSelectBook";
import StepConfigure from "@/components/marketing/wizard/steps/StepConfigure";
import StepResult from "@/components/marketing/wizard/steps/StepResult";
import {
  WIZARD_STEP_META,
  type WizardStep,
} from "@/components/marketing/wizard/wizard-machine";
import type { Book } from "@/lib/marketing/types";

type MarketingPortalWizardProps = {
  books: Book[];
  initialBookId?: string | null;
  embedded?: boolean;
};

function StepRenderer() {
  const { state } = useTrailerWizard();

  const renderStep = (step: WizardStep) => {
    switch (step) {
      case "selectBook":
        return <StepSelectBook />;
      case "configure":
        return <StepConfigure />;
      case "result":
        return <StepResult />;
      default:
        return null;
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <StepProgressIndicator />
        <StepErrorBoundary
          stepKey={state.step}
          stepTitle={WIZARD_STEP_META[state.step].title}
        >
          {renderStep(state.step)}
        </StepErrorBoundary>
      </div>
      <div className="hidden lg:block">
        <WizardPreviewPanel />
      </div>
    </div>
  );
}

export default function MarketingPortalWizard({
  books,
  initialBookId = null,
  embedded = false,
}: MarketingPortalWizardProps) {
  const content = (
    <>
      {!embedded ? (
        <>
          <Link
            href="/author/home"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Tillbaka till Dashboard
          </Link>

          <header className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF] to-[#6C5CE7] shadow-sm">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-white"
                >
                  <path
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  AI Trailer Studio
                </h1>
                <p className="text-[14px] text-slate-500 dark:text-white/50">
                  Skapa en boktrailer automatiskt i tre steg
                </p>
              </div>
            </div>
          </header>
        </>
      ) : null}

      {books.length === 0 ? (
        <section className="card-base p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-slate-400 dark:text-white/30"
            >
              <path
                d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-[16px] font-semibold text-slate-900 dark:text-white">
            Inga böcker ännu
          </h2>
          <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
            Du behöver minst en bok för att skapa en trailer.
          </p>
          <Link
            href="/author/library"
            className="btn-primary mt-5 inline-flex"
          >
            Öppna biblioteket
          </Link>
        </section>
      ) : (
        <TrailerWizardProvider books={books} initialBookId={initialBookId}>
          <StepRenderer />
        </TrailerWizardProvider>
      )}
    </>
  );

  if (embedded) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10">
        {content}
      </div>
    </main>
  );
}
