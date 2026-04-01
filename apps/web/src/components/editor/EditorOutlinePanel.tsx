"use client";

import { useEffect, useState } from "react";
import { FileText, Hash } from "lucide-react";
import type { Editor } from "@tiptap/react";

type OutlineItem = {
  level: number;
  text: string;
  pos: number;
};

function extractOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim();
      if (text) {
        items.push({ level: node.attrs.level as number, text, pos });
      }
    }
  });
  return items;
}

type EditorOutlinePanelProps = {
  editor: Editor;
};

export default function EditorOutlinePanel({ editor }: EditorOutlinePanelProps) {
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  useEffect(() => {
    const update = () => setOutline(extractOutline(editor));
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor]);

  const scrollToPos = (pos: number) => {
    editor.chain().focus().setTextSelection(pos).run();
    // Scroll the editor view to the heading
    const dom = editor.view.domAtPos(pos);
    if (dom?.node) {
      const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (outline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5">
          <FileText className="h-5 w-5 text-slate-400 dark:text-white/30" />
        </div>
        <p className="text-[13px] text-slate-400 dark:text-white/35">
          Add headings to see the document outline here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
        Outline
      </h3>
      <nav className="space-y-0.5">
        {outline.map((item, i) => (
          <button
            key={`${item.pos}-${i}`}
            type="button"
            onClick={() => scrollToPos(item.pos)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
            style={{ paddingLeft: `${(item.level - 1) * 16 + 8}px` }}
          >
            <Hash className="h-3 w-3 shrink-0 text-slate-300 dark:text-white/20" />
            <span className={`truncate text-[13px] ${
              item.level === 1
                ? "font-semibold text-slate-700 dark:text-white/80"
                : item.level === 2
                ? "font-medium text-slate-600 dark:text-white/60"
                : "text-slate-500 dark:text-white/45"
            }`}>
              {item.text}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
