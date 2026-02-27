"use client";

import StepErrorBoundary from "@/components/marketing/wizard/StepErrorBoundary";
import StepProgressIndicator from "@/components/marketing/wizard/StepProgressIndicator";
import WizardPreviewPanel from "@/components/marketing/wizard/WizardPreviewPanel";
import {
  TrailerWizardProvider,
  useTrailerWizard,
} from "@/components/marketing/wizard/WizardContext";
import StepSelectBook from "@/components/marketing/wizard/steps/StepSelectBook";
import StepFeeling from "@/components/marketing/wizard/steps/StepFeeling";
import StepStory from "@/components/marketing/wizard/steps/StepStory";
import StepPreviewScenes from "@/components/marketing/wizard/steps/StepPreviewScenes";
import StepBuildTrailer from "@/components/marketing/wizard/steps/StepBuildTrailer";
import {
  WIZARD_STEP_META,
  type WizardStep,
} from "@/components/marketing/wizard/wizard-machine";
import type { Book } from "@/lib/marketing/types";

type MarketingPortalWizardProps = {
  books: Book[];
  initialBookId?: string | null;
};

function StepRenderer() {
  const { state } = useTrailerWizard();

  const renderStep = (step: WizardStep) => {
    switch (step) {
      case "selectBook":
        return <StepSelectBook />;
      case "feeling":
        return <StepFeeling />;
      case "story":
        return <StepStory />;
      case "previewScenes":
        return <StepPreviewScenes />;
      case "buildTrailer":
        return <StepBuildTrailer />;
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
}: MarketingPortalWizardProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10">
        <header className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            AI Asset Studio
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-white/50">
            Skapa en boktrailer i fem enkla steg.
          </p>
        </header>

        {books.length === 0 ? (
          <section className="card-base p-8 text-center">
            <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">
              Inga böcker ännu
            </h2>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-white/50">
              Lägg till en bok först, kom sedan tillbaka.
            </p>
          </section>
        ) : (
          <TrailerWizardProvider books={books} initialBookId={initialBookId}>
            <StepRenderer />
          </TrailerWizardProvider>
        )}
      </div>
    </main>
  );
}
