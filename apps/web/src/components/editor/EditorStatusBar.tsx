"use client";

import { useMemo } from "react";
import { Clock, FileText, PanelRight, Maximize2, Minimize2, Save } from "lucide-react";

type EditorStatusBarProps = {
  wordCount: number;
  isSaving: boolean;
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

  const saveStatus = isSaving
    ? "Saving..."
    : hasUnsavedChanges
    ? "Unsaved changes"
    : formatLastSaved(lastSaved);

  return (
    <div className="flex items-center justify-between bg-slate-50/60 px-5 py-2.5 text-[13px] text-slate-500 dark:bg-white/[0.02] dark:text-white/35">
      {/* Left: stats */}
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <FileText className="h-3.5 w-3.5" />
          {wordCount.toLocaleString()} words
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {readingTime}
        </span>
      </div>

      {/* Center: save status */}
      <div className="flex items-center gap-1.5">
        {isSaving && <Save className="h-3 w-3 animate-pulse" />}
        <span className={isSaving ? "animate-pulse" : hasUnsavedChanges ? "text-amber-500 dark:text-amber-400" : ""}>
          {saveStatus}
        </span>
      </div>

      {/* Right: view controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSidePanel}
          className={`flex h-7 items-center gap-1 rounded-lg px-2 transition ${
            sidePanelOpen
              ? "bg-[#907AFF]/10 text-[#907AFF]"
              : "hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-white/5"
          }`}
          title="Toggle side panel"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleFocusMode}
          className="flex h-7 items-center gap-1 rounded-lg px-2 transition hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-white/5"
          title={focusMode ? "Exit focus mode" : "Focus mode"}
        >
          {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
