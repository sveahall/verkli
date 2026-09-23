"use client";

import { useMemo } from "react";
import { AlertCircle, Clock, FileText, PanelRight, Maximize2, Minimize2, Save } from "lucide-react";

type EditorStatusBarProps = {
  wordCount: number;
  isSaving: boolean;
  saveError?: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  focusMode: boolean;
  sidePanelOpen: boolean;
  onToggleFocusMode: () => void;
  onToggleSidePanel: () => void;
};

function formatLastSaved(date: Date | null): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 5000) return "Just saved";
  if (diff < 60000) return `Saved ${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `Saved ${Math.round(diff / 60000)}m ago`;
  return `Saved at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function EditorStatusBar({
  wordCount,
  isSaving,
  saveError = false,
  hasUnsavedChanges,
  lastSaved,
  focusMode,
  sidePanelOpen,
  onToggleFocusMode,
  onToggleSidePanel,
}: EditorStatusBarProps) {
  const readingTime = useMemo(() => {
    const minutes = Math.max(1, Math.ceil(wordCount / 250));
    return `${minutes} min read`;
  }, [wordCount]);

  const saveStatus = saveError
    ? "Could not save. Your changes are still unsaved."
    : isSaving
    ? "Saving..."
    : hasUnsavedChanges
    ? "Unsaved changes"
    : formatLastSaved(lastSaved);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 bg-background px-5 py-2 text-[12px] text-muted-foreground">
      {/* Left: stats */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {wordCount.toLocaleString()} words
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {readingTime}
        </span>
      </div>

      {/* Center: save status */}
      <div role={saveError ? "alert" : "status"} className={`flex items-center gap-1.5 ${saveError ? "text-red-700 dark:text-red-300" : ""}`}>
        {saveError ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : isSaving && <Save className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className={!saveError && !isSaving && hasUnsavedChanges ? "text-amber-700 dark:text-amber-300" : ""}>
          {saveStatus}
        </span>
      </div>

      {/* Right: view controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSidePanel}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            sidePanelOpen
              ? "bg-accent text-accent-foreground"
              : "hover:bg-card hover:text-foreground"
          }`}
          title="Toggle side panel"
          aria-label="Toggle side panel"
          aria-pressed={sidePanelOpen}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleFocusMode}
          className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 transition-colors hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          title={focusMode ? "Exit focus mode" : "Focus mode"}
          aria-label={focusMode ? "Exit focus mode" : "Focus mode"}
        >
          {focusMode ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
