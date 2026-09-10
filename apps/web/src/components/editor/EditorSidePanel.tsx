"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Type,
  ListTree,
  Search,
  ChevronLeft,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

const EditorFormatPanel = dynamic(() => import("./EditorFormatPanel"));
const EditorOutlinePanel = dynamic(() => import("./EditorOutlinePanel"));
const EditorFindReplace = dynamic(() => import("./EditorFindReplace"));

type PanelTab = "format" | "outline" | "find";

const TAB_CONFIG: Array<{
  id: PanelTab;
  label: string;
  icon: typeof Type;
}> = [
  { id: "format", label: "Format", icon: Type },
  { id: "outline", label: "Outline", icon: ListTree },
  { id: "find", label: "Find", icon: Search },
];

type EditorSidePanelProps = {
  editor: Editor;
  preset: string;
  onPresetChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
};

export default function EditorSidePanel({
  editor,
  preset,
  onPresetChange,
  open,
  onToggle,
}: EditorSidePanelProps) {
  const [tab, setTab] = useState<PanelTab>("format");

  if (!open) {
    return (
      <div className="flex w-full items-center justify-center gap-2 border-t border-border bg-background/50 py-2 lg:w-12 lg:flex-col lg:justify-start lg:border-l lg:border-t-0 lg:py-4 dark:border-border dark:bg-card">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); onToggle(); }}
            className="flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-muted-foreground transition hover:bg-card hover:text-accent-foreground hover:shadow-sm dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
            title={t.label}
          >
            <t.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-t lg:w-[280px] lg:border-l lg:border-t-0 border-border bg-card dark:border-border dark:bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground dark:text-muted-foreground dark:hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[14px] font-semibold text-foreground dark:text-foreground">
            {TAB_CONFIG.find((t) => t.id === tab)?.label}
          </h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border dark:border-border">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition ${
              tab === t.id
                ? "border-b-2 border-[#907AFF] text-accent-foreground"
                : "text-muted-foreground hover:text-muted-foreground dark:text-muted-foreground dark:hover:text-muted-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "format" && (
          <EditorFormatPanel editor={editor} preset={preset} onPresetChange={onPresetChange} />
        )}
        {tab === "outline" && <EditorOutlinePanel editor={editor} />}
        {tab === "find" && (
          <EditorFindReplace editor={editor} onClose={() => setTab("format")} />
        )}
      </div>
    </aside>
  );
}
