"use client";

import { useCallback, useMemo, useEffect, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  WRITE_INLINE_AI_EVENT,
  type InlineAiAction,
  type WriteInlineAiEventDetail,
} from "@/features/book-workspace/types";
import type { CommandPaletteItem } from "@/components/editor/CommandPalette";
import type { Tool } from "../BookEditorView.types";

interface UseBookEditorNavigationOptions {
  bookId: string;
  setTool: (tool: Tool) => void;
  setFocusMode: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setPreset: (preset: string) => void;
  handleCreateChapter: () => void;
  setCommands: Dispatch<SetStateAction<CommandPaletteItem[]>>;
}

export function useBookEditorNavigation({
  bookId,
  setTool,
  setFocusMode,
  setPreset,
  handleCreateChapter,
  setCommands,
}: UseBookEditorNavigationOptions) {
  const router = useRouter();

  const navigateToPanel = useCallback(
    (panel: Tool) => {
      setTool(panel);
      const href =
        panel === "edit"
          ? `/author/books/${bookId}`
          : `/author/books/${bookId}?panel=${panel}`;
      router.push(href, { scroll: false });
    },
    [bookId, router, setTool]
  );

  const openProductionWorkspace = useCallback(
    (kind: "audiobook" | "translation") => {
      router.push(`/author/production?bookId=${bookId}&kind=${kind}`);
    },
    [bookId, router]
  );

  const openAudienceMarketingWorkspace = useCallback(() => {
    router.push(`/author/audience?bookId=${bookId}&surface=marketing-assets`);
  }, [bookId, router]);

  const openAudiencePublishWorkspace = useCallback(() => {
    router.push(`/author/audience?bookId=${bookId}&surface=beta-readers`);
  }, [bookId, router]);

  const openAnalyticsWorkspace = useCallback(() => {
    router.push(`/author/analytics?bookId=${bookId}`);
  }, [bookId, router]);

  const handleInlineAiAction = useCallback(
    (action: InlineAiAction, selectedText: string) => {
      const detail: WriteInlineAiEventDetail = { action, selectedText };
      window.dispatchEvent(
        new CustomEvent<WriteInlineAiEventDetail>(WRITE_INLINE_AI_EVENT, { detail })
      );
      if (action === "audiobook") openProductionWorkspace("audiobook");
      if (action === "translate") openProductionWorkspace("translation");
    },
    [openProductionWorkspace]
  );

  const commands = useMemo(
    () => [
      { id: "focus", label: "Toggle focus mode", shortcut: "⌘\\", group: "Write", onSelect: () => setFocusMode((f: boolean) => !f) },
      { id: "new-chapter", label: "New chapter", group: "Write", onSelect: handleCreateChapter },
      { id: "preset-novel", label: "Preset: Novel", group: "Write", onSelect: () => setPreset("novel") },
      { id: "preset-essay", label: "Preset: Essay", group: "Write", onSelect: () => setPreset("essay") },
      { id: "preset-screenplay", label: "Preset: Screenplay", group: "Write", onSelect: () => setPreset("screenplay") },
      { id: "generate-audiobook", label: "Generate audiobook", group: "Workflow", icon: "audio", keywords: ["production", "voice", "audio"], onSelect: () => openProductionWorkspace("audiobook") },
      { id: "translate-book", label: "Translate book", group: "Workflow", icon: "languages", keywords: ["production", "localize", "translation"], onSelect: () => openProductionWorkspace("translation") },
      { id: "publish-book", label: "Publish book", group: "Workflow", icon: "rocket", keywords: ["audience", "beta readers", "publish"], onSelect: openAudiencePublishWorkspace },
      { id: "create-campaign", label: "Create campaign", group: "Workflow", icon: "megaphone", keywords: ["audience", "marketing", "assets"], onSelect: openAudienceMarketingWorkspace },
      { id: "open-analytics", label: "Open analytics", group: "Workflow", icon: "chart", keywords: ["growth", "engagement", "signals"], onSelect: openAnalyticsWorkspace },
    ],
    [handleCreateChapter, openAnalyticsWorkspace, openAudienceMarketingWorkspace, openAudiencePublishWorkspace, openProductionWorkspace, setFocusMode, setPreset]
  );

  useEffect(() => {
    setCommands(commands);
    return () => setCommands([]);
  }, [commands, setCommands]);

  return {
    navigateToPanel,
    openProductionWorkspace,
    handleInlineAiAction,
  };
}
