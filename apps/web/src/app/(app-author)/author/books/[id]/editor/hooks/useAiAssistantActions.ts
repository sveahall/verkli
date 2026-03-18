"use client";

import { useMemo } from "react";

type AiAssistantSection = Record<string, unknown>;

type Props = {
  translation: AiAssistantSection;
  original: AiAssistantSection;
  audiobook: AiAssistantSection;
  marketing: AiAssistantSection;
};

export function useAiAssistantActions({
  translation,
  original,
  audiobook,
  marketing,
}: Props) {
  return useMemo(
    () => ({
      translation,
      original,
      audiobook,
      marketing,
    }),
    [audiobook, marketing, original, translation]
  );
}
