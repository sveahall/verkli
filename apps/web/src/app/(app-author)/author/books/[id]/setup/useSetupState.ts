"use client";

import { useState, useCallback, useRef } from "react";
import {
  WIZARD_STEPS,
  SKIPPABLE_STEPS,
  getFirstIncompleteStep,
  areAllStepsDone,
  type BookSetupState,
  type WizardStep,
} from "@/lib/books/setup-state";

type UseSetupStateReturn = {
  currentStep: WizardStep;
  setupState: BookSetupState;
  goToStep: (step: WizardStep) => void;
  completeStep: (step: WizardStep, extras?: Partial<BookSetupState>) => Promise<void>;
  skipStep: (step: WizardStep) => Promise<void>;
  goBack: () => void;
  goNext: () => void;
  canSkip: boolean;
  isComplete: boolean;
  isSaving: boolean;
  completeSetup: (choice: "publish" | "draft") => Promise<void>;
};

export function useSetupState(bookId: string, initialState: BookSetupState): UseSetupStateReturn {
  const [setupState, setSetupState] = useState<BookSetupState>(initialState);
  const [currentStep, setCurrentStep] = useState<WizardStep>(() =>
    getFirstIncompleteStep(initialState)
  );
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const persistState = useCallback(
    async (nextState: BookSetupState) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setIsSaving(true);
      try {
        await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setup_state: nextState }),
        });
      } catch (err) {
        console.warn("[useSetupState] persist failed", err);
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [bookId]
  );

  const advanceToNextStep = useCallback((fromStep: WizardStep) => {
    const idx = WIZARD_STEPS.indexOf(fromStep);
    if (idx >= 0 && idx < WIZARD_STEPS.length - 1) {
      setCurrentStep(WIZARD_STEPS[idx + 1]);
    }
  }, []);

  const completeStep = useCallback(
    async (step: WizardStep, extras?: Partial<BookSetupState>) => {
      const next: BookSetupState = {
        ...setupState,
        ...extras,
        steps: { ...setupState.steps, [step]: "completed" },
      };
      setSetupState(next);
      advanceToNextStep(step);
      await persistState(next);
    },
    [setupState, advanceToNextStep, persistState]
  );

  const skipStep = useCallback(
    async (step: WizardStep) => {
      if (!SKIPPABLE_STEPS.has(step)) return;
      const next: BookSetupState = {
        ...setupState,
        steps: { ...setupState.steps, [step]: "skipped" },
      };
      setSetupState(next);
      advanceToNextStep(step);
      await persistState(next);
    },
    [setupState, advanceToNextStep, persistState]
  );

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const goBack = useCallback(() => {
    const idx = WIZARD_STEPS.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(WIZARD_STEPS[idx - 1]);
    }
  }, [currentStep]);

  const goNext = useCallback(() => {
    advanceToNextStep(currentStep);
  }, [currentStep, advanceToNextStep]);

  const completeSetup = useCallback(
    async (choice: "publish" | "draft") => {
      const next: BookSetupState = {
        ...setupState,
        completed: true,
        completedAt: new Date().toISOString(),
        steps: { ...setupState.steps, publish: "completed" },
        publishChoice: choice,
      };
      setSetupState(next);
      await persistState(next);
    },
    [setupState, persistState]
  );

  return {
    currentStep,
    setupState,
    goToStep,
    completeStep,
    skipStep,
    goBack,
    goNext,
    canSkip: SKIPPABLE_STEPS.has(currentStep),
    isComplete: areAllStepsDone(setupState),
    isSaving,
    completeSetup,
  };
}
