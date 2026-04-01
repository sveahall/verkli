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
      <div className="flex flex-col items-center gap-1 border-l border-slate-100 bg-white py-3 dark:border-white/[0.06] dark:bg-[#111318]">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); onToggle(); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/60"
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-slate-100 bg-white dark:border-white/[0.06] dark:bg-[#111318]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:text-white/30 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[14px] font-semibold text-slate-800 dark:text-white">
            {TAB_CONFIG.find((t) => t.id === tab)?.label}
          </h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-white/[0.06]">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition ${
              tab === t.id
                ? "border-b-2 border-[#907AFF] text-[#907AFF]"
                : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
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
