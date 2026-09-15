"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { Editor } from "@tiptap/react";

type EditorFindReplaceProps = {
  editor: Editor;
  onClose: () => void;
};

type Match = { from: number; to: number };

export function findAllMatches(editor: Editor, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  // ProseMirror positions include block boundaries; plain-text offsets do not.
  // Map each text block directly, retaining positions across inline marks.
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escapedQuery, caseSensitive ? "g" : "gi");
  editor.state.doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return;
    let text = "";
    const positions: number[] = [];
    block.descendants((node, offset) => {
      if (node.isText && node.text) {
        text += node.text;
        for (let index = 0; index < node.text.length; index++) {
          positions.push(blockPos + 1 + offset + index);
        }
      } else if (node.isLeaf) {
        // A hard break or inline image must not join two separate words.
        text += "\uFFFC";
        positions.push(-1);
      }
    });
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const from = positions[match.index];
      const last = positions[match.index + match[0].length - 1];
      if (from >= 0 && last >= 0 && !positions.slice(match.index, match.index + match[0].length).includes(-1)) {
        matches.push({ from, to: last + 1 });
      }
    }
    return false;
  });
  return matches;
}

export default function EditorFindReplace({ editor, onClose }: EditorFindReplaceProps) {
  const fieldId = useId();
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

  useEffect(() => {
    const refresh = () => {
      const found = findAllMatches(editor, findQuery, caseSensitive);
      setMatches(found);
      setMatchIndex((current) => Math.min(current, Math.max(0, found.length - 1)));
    };
    editor.on("update", refresh);
    return () => { editor.off("update", refresh); };
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
      if (e.key === "Enter" && e.target === findRef.current) {
        e.preventDefault();
        goToMatch(e.shiftKey ? "prev" : "next");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToMatch, onClose]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-foreground">
          Find and replace
        </h3>
        <button type="button" onClick={onClose} aria-label="Close find and replace" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Find */}
      <div>
        <label htmlFor={`${fieldId}-find`} className="mb-1.5 block text-[12px] text-muted-foreground">Find</label>
        <div className="flex gap-1">
          <input
            ref={findRef}
            id={`${fieldId}-find`}
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Search..."
            aria-describedby={findQuery ? `${fieldId}-matches` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-[16px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-[14px]"
          />
          <button type="button" onClick={() => goToMatch("prev")} aria-label="Previous match" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" title="Previous (Shift+Enter)">
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => goToMatch("next")} aria-label="Next match" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" title="Next (Enter)">
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {findQuery && (
          <p id={`${fieldId}-matches`} role="status" className="mt-2 text-[12px] text-muted-foreground">
            {matches.length === 0 ? "No matches" : `${matchIndex + 1} of ${matches.length}`}
          </p>
        )}
      </div>

      {/* Replace */}
      <div>
        <label htmlFor={`${fieldId}-replace`} className="mb-1.5 block text-[12px] text-muted-foreground">Replace</label>
        <input
          id={`${fieldId}-replace`}
          type="text"
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          placeholder="Replace with..."
          className="min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 text-[16px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-[14px]"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={replaceCurrent} disabled={matches.length === 0} className="min-h-11 rounded-full border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">
            Replace
          </button>
          <button type="button" onClick={replaceAll} disabled={matches.length === 0} className="min-h-11 rounded-full border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">
            Replace all
          </button>
        </div>
      </div>

      {/* Options */}
      <div>
        <h4 className="mb-1 text-[13px] font-medium text-foreground">
          Options
        </h4>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          Match case
        </label>
      </div>
    </div>
  );
}
