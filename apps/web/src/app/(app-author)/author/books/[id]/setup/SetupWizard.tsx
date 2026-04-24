"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetupState } from "./useSetupState";
import SetupStepIndicator from "./SetupStepIndicator";
import EditStep from "./steps/EditStep";
import CoverStep from "./steps/CoverStep";
import TranslateStep from "./steps/TranslateStep";
import AudiobookStep from "./steps/AudiobookStep";
import PrintStep from "./steps/PrintStep";
import PricingStep from "./steps/PricingStep";
import PublishStep from "./steps/PublishStep";
import type { BookSetupState } from "@/lib/books/setup-state";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
};

type Book = {
  id: string;
  title: string;
  cover_image: string | null;
  status: string;
  price_amount?: number | null;
  price_currency?: string | null;
};

type Props = {
  book: Book;
  chapters: Chapter[];
  initialSetupState: BookSetupState;
  onSwitchToEditor: (panel?: string) => void;
};

function hasReadableContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content.map(extractText).join("");
  }
  return "";
}

export default function SetupWizard({ book, chapters, initialSetupState, onSwitchToEditor }: Props) {
  const router = useRouter();
  const {
    currentStep,
    setupState,
    goToStep,
    completeStep,
    skipStep,
    goBack,
    isSaving,
    completeSetup,
  } = useSetupState(book.id, initialSetupState);

  const chapterCount = chapters.length;
  const hasContent = chapters.some((ch) => hasReadableContent(ch.content));

  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublishComplete = async (choice: "publish" | "draft") => {
    setPublishError(null);
    if (choice === "publish" && book.status !== "PUBLISHED") {
      // Do NOT swallow publish errors: the wizard would otherwise mark setup
      // "complete" while the book stays in DRAFT. Surface the failure so the
      // user can fix the underlying issue (missing cover, visibility, etc.).
      try {
        const res = await fetch(`/api/books/${encodeURIComponent(book.id)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: "public" }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          const message =
            (body && typeof body.error === "string" ? body.error : null) ??
            `Publish failed (${res.status})`;
          setPublishError(message);
          return;
        }
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : "Publish failed");
        return;
      }
    }
    await completeSetup(choice);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-2 text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{book.title}</h1>
        <p className="mt-1 text-[13px] text-slate-400 dark:text-white/40">Book setup</p>
      </div>

      <SetupStepIndicator
        currentStep={currentStep}
        setupState={setupState}
        onStepClick={goToStep}
      />

      <div className="mt-6">
        {currentStep === "edit" && (
          <EditStep
            chapterCount={chapterCount}
            hasContent={hasContent}
            onComplete={() => void completeStep("edit")}
            onOpenEditor={() => onSwitchToEditor("edit")}
          />
        )}
        {currentStep === "cover" && (
          <CoverStep
            coverImageUrl={book.cover_image}
            onComplete={() => void completeStep("cover")}
            onOpenCover={() => onSwitchToEditor("cover")}
          />
        )}
        {currentStep === "translate" && (
          <TranslateStep
            onComplete={() => void completeStep("translate", { translateLanguages: [] })}
            onSkip={() => void skipStep("translate")}
          />
        )}
        {currentStep === "audiobook" && (
          <AudiobookStep
            onComplete={() => void completeStep("audiobook", { audiobookEnabled: true })}
            onSkip={() => void skipStep("audiobook")}
          />
        )}
        {currentStep === "print" && (
          <PrintStep
            onComplete={() => void completeStep("print", { printEnabled: true })}
            onSkip={() => void skipStep("print")}
          />
        )}
        {currentStep === "pricing" && (
          <PricingStep
            currentPriceAmount={book.price_amount ?? null}
            currentPriceCurrency={String(book.price_currency ?? "SEK")}
            onComplete={() => void completeStep("pricing")}
          />
        )}
        {currentStep === "publish" && (
          <>
            <PublishStep
              bookTitle={book.title}
              isAlreadyPublished={book.status === "PUBLISHED"}
              onComplete={handlePublishComplete}
              isSaving={isSaving}
            />
            {publishError && (
              <div
                role="alert"
                className="mx-auto mt-4 max-w-xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
              >
                {publishError}
              </div>
            )}
          </>
        )}
      </div>

      {currentStep !== "edit" && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={goBack}
            className="text-[13px] text-slate-400 transition hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80"
          >
            &larr; Back
          </button>
        </div>
      )}
    </div>
  );
}
