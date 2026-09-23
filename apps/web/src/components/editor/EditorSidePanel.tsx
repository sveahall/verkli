"use client";

import { useId, useRef, useState } from "react";
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
  const [focusedTab, setFocusedTab] = useState<PanelTab>("format");
  const panelId = useId();
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  const togglePanel = (nextTab: PanelTab) => {
    setTab(nextTab);
    setFocusedTab(nextTab);
    onToggle();
    requestAnimationFrame(() => {
      const target = tabRefs.current[nextTab];
      if (target?.getClientRects().length) target.focus();
    });
  };

  const closeFind = () => {
    setTab("format");
    setFocusedTab("format");
    tabRefs.current.format?.focus();
  };

  if (!open) {
    return (
      <div role="group" aria-label="Writing tools" className="flex w-full items-center justify-center gap-2 border-t border-border bg-background py-2 lg:w-14 lg:flex-col lg:justify-start lg:border-l lg:border-t-0 lg:py-4">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            ref={(element) => { tabRefs.current[t.id] = element; }}
            onClick={() => togglePanel(t.id)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            title={`Open ${t.label.toLowerCase()} panel`}
            aria-label={`Open ${t.label.toLowerCase()} panel`}
            aria-expanded={false}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside aria-label="Writing tools" className="flex w-full shrink-0 flex-col border-t border-border bg-background lg:w-[280px] lg:border-l lg:border-t-0">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <div role="tablist" aria-label="Writing tools" className="flex min-w-0 flex-1">
          {TAB_CONFIG.map((t, index) => (
            <button
              key={t.id}
              type="button"
              ref={(element) => { tabRefs.current[t.id] = element; }}
              role="tab"
              id={`${panelId}-${t.id}-tab`}
              aria-controls={`${panelId}-${t.id}-panel`}
              aria-selected={tab === t.id}
              tabIndex={focusedTab === t.id ? 0 : -1}
              onFocus={() => setFocusedTab(t.id)}
              onClick={() => { setTab(t.id); setFocusedTab(t.id); }}
              onKeyDown={(event) => {
                const nextIndex = event.key === "ArrowRight" ? (index + 1) % TAB_CONFIG.length
                  : event.key === "ArrowLeft" ? (index + TAB_CONFIG.length - 1) % TAB_CONFIG.length
                  : event.key === "Home" ? 0
                  : event.key === "End" ? TAB_CONFIG.length - 1
                  : null;
                if (nextIndex === null) return;
                event.preventDefault();
                tabRefs.current[TAB_CONFIG[nextIndex].id]?.focus();
              }}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                tab === t.id
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => togglePanel(tab)}
          aria-label="Collapse writing tools"
          aria-expanded={true}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {TAB_CONFIG.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${panelId}-${item.id}-panel`}
          aria-labelledby={`${panelId}-${item.id}-tab`}
          hidden={tab !== item.id}
          tabIndex={0}
          className="min-w-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {tab === item.id && item.id === "format" && (
            <EditorFormatPanel editor={editor} preset={preset} onPresetChange={onPresetChange} />
          )}
          {tab === item.id && item.id === "outline" && <EditorOutlinePanel editor={editor} />}
          {tab === item.id && item.id === "find" && (
            <EditorFindReplace editor={editor} onClose={closeFind} />
          )}
        </div>
      ))}
    </aside>
  );
}
