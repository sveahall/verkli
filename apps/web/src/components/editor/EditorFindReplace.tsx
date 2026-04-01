"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { Editor } from "@tiptap/react";

type EditorFindReplaceProps = {
  editor: Editor;
  onClose: () => void;
};

type Match = { from: number; to: number };

function findAllMatches(editor: Editor, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  const doc = editor.state.doc;
  const text = doc.textBetween(0, doc.content.size, "\n");
  const search = caseSensitive ? query : query.toLowerCase();
  const hay = caseSensitive ? text : text.toLowerCase();

  let index = 0;
  while (index < hay.length) {
    const found = hay.indexOf(search, index);
    if (found === -1) break;
    // Map text offset → doc position (account for nodes)
    let docPos = 0;
    let charsSeen = 0;
    doc.descendants((node, pos) => {
      if (charsSeen <= found && node.isText) {
        const nodeText = node.text ?? "";
        const startChars = charsSeen;
        charsSeen += nodeText.length;
        if (startChars <= found && found < charsSeen) {
          docPos = pos + (found - startChars);
        }
      } else if (node.isBlock && charsSeen <= found) {
        charsSeen += 1; // for the \n separator
      }
    });
    if (docPos > 0) {
      matches.push({ from: docPos, to: docPos + query.length });
    }
    index = found + 1;
  }
  return matches;
}

export default function EditorFindReplace({ editor, onClose }: EditorFindReplaceProps) {
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => { findRef.current?.focus(); }, []);

  useEffect(() => {
    const update = () => {
      const found = findAllMatches(editor, findQuery, caseSensitive);
      setMatches(found);
      setMatchIndex(0);
      if (found.length > 0) {
        editor.chain().setTextSelection(found[0]).scrollIntoView().run();
      }
    };
    // Defer to avoid setState-in-effect lint rule
    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [editor, findQuery, caseSensitive]);

  const goToMatch = useCallback(
    (direction: "next" | "prev") => {
      if (matches.length === 0) return;
      const next = direction === "next"
        ? (matchIndex + 1) % matches.length
        : (matchIndex - 1 + matches.length) % matches.length;
      setMatchIndex(next);
      editor.chain().setTextSelection(matches[next]).scrollIntoView().run();
    },
    [editor, matches, matchIndex]
  );

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0) return;
    const match = matches[matchIndex];
    editor.chain().focus().setTextSelection(match).deleteSelection().insertContent(replaceQuery).run();
    // Re-find after replace
    const found = findAllMatches(editor, findQuery, caseSensitive);
    setMatches(found);
    setMatchIndex(Math.min(matchIndex, Math.max(0, found.length - 1)));
  }, [editor, matches, matchIndex, findQuery, replaceQuery, caseSensitive]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;
    // Replace from end to start to preserve positions
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    let chain = editor.chain();
    for (const match of sorted) {
      chain = chain.setTextSelection(match).deleteSelection().insertContent(replaceQuery);
    }
    chain.run();
    setMatches([]);
    setMatchIndex(0);
  }, [editor, matches, replaceQuery]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !e.shiftKey) goToMatch("next");
      if (e.key === "Enter" && e.shiftKey) goToMatch("prev");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToMatch, onClose]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
          Find and replace
        </h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Find */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-white/40">Find</label>
        <div className="flex gap-1.5">
          <input
            ref={findRef}
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <button type="button" onClick={() => goToMatch("prev")} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5" title="Previous (Shift+Enter)">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => goToMatch("next")} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5" title="Next (Enter)">
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
        {findQuery && (
          <p className="mt-1.5 text-[12px] text-slate-400 dark:text-white/30">
            {matches.length === 0 ? "No matches" : `${matchIndex + 1} of ${matches.length}`}
          </p>
        )}
      </div>

      {/* Replace */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-white/40">Replace</label>
        <input
          type="text"
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          placeholder="Replace with..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={replaceCurrent} disabled={matches.length === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5">
            Replace
          </button>
          <button type="button" onClick={replaceAll} disabled={matches.length === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5">
            Replace all
          </button>
        </div>
      </div>

      {/* Options */}
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
          Options
        </h4>
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-white/50">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-[#907AFF]"
          />
          Match case
        </label>
      </div>
    </div>
  );
}
