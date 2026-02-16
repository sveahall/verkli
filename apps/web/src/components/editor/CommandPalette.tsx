"use client";

import { useEffect, useRef, useState, useMemo } from "react";

export type Command = {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: Command[];
};

export default function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Reset query and selection when the palette opens
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient palette state on explicit open transition
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[selected]?.run();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          placeholder="Search commands..."
          className="w-full border-0 bg-transparent px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/40"
        />
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 py-2 dark:border-white/10">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-white/50">No commands found</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.run();
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                  i === selected
                    ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
                    : "text-slate-700 hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/5"
                }`}
                onMouseEnter={() => setSelected(i)}
              >
                <span>{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="text-xs text-slate-400 dark:text-white/40">{cmd.shortcut}</kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
