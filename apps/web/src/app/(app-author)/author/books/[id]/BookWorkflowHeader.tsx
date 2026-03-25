"use client";

import type { Tool } from "./editor/bookEditor.shared";

type Props = {
  bookId: string;
  bookTitle: string;
  authorDisplayName: string;
  activeTool: Tool;
  tools: Tool[];
  isPublished: boolean;
  chapterCount: number;
  wordCount: number;
  activeLanguageLabel: string;
  versionCount: number;
};

export default function BookWorkflowHeader(_props: Props) {
  // Omdesignen du bad om: ta bort den övre hero-boxen helt.
  // Previous/Flow/Next finns istället via `WorkflowStepNav` i `layout.tsx`.
  return null;
}
