"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteItem = {
  id: string;
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon?: string;
  group?: string;
  keywords?: string[];
  onHighlight?: () => void;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  title?: string;
};

function matchesQuery(item: CommandPaletteItem, query: string) {
  if (!query) return true;
  const haystack = [
    item.label,
    item.subtitle ?? "",
    ...(item.keywords ?? []),
    item.group ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function IconBadge({ icon }: { icon?: string }) {
  if (!icon) {
    return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10">•</span>;
  }

  const labels: Record<string, string> = {
    plus: "+",
    book: "B",
    audio: "A",
    languages: "L",
    rocket: "P",
    megaphone: "M",
    chart: "G",
  };

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70">
      {labels[icon] ?? icon.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function CommandPalette({
  open,
  onClose,
  items,
  loading = false,
  placeholder = "Search commands...",
  emptyMessage = "No commands found",
  title = "Command palette",
}: Props) {
  if (!open) return null;

  return (
    <PaletteDialog
      onClose={onClose}
      items={items}
      loading={loading}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      title={title}
    />
  );
}

function PaletteDialog({
  onClose,
  items,
  loading,
  placeholder,
  emptyMessage,
  title,
}: Omit<Props, "open">) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => matchesQuery(item, normalizedQuery));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    return filteredItems.reduce<Array<{ group: string; items: CommandPaletteItem[] }>>((groups, item) => {
      const groupLabel = item.group ?? "Commands";
      const group = groups.find((entry) => entry.group === groupLabel);
      if (group) {
        group.items.push(item);
        return groups;
      }
      groups.push({ group: groupLabel, items: [item] });
      return groups;
    }, []);
  }, [filteredItems]);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    filteredItems[selected]?.onHighlight?.();
  }, [filteredItems, selected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (loading) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((current) => Math.min(current + 1, filteredItems.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        filteredItems[selected]?.onSelect();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredItems, loading, onClose, selected]);

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            {title}
          </p>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            placeholder={placeholder}
            className="mt-2 w-full border-0 bg-transparent p-0 text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-32 rounded-full bg-slate-200 dark:bg-white/10" />
                    <div className="h-3 w-48 rounded-full bg-slate-100 dark:bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="px-3 py-6 text-sm text-slate-500 dark:text-white/45">{emptyMessage}</p>
          ) : (
            groupedItems.map((group) => (
              <div key={group.group} className="pb-2">
                <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                  {group.group}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    runningIndex += 1;
                    const isSelected = runningIndex === selected;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => {
                          item.onHighlight?.();
                          setSelected(runningIndex);
                        }}
                        onClick={() => item.onSelect()}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                          isSelected
                            ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
                            : "text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5"
                        }`}
                      >
                        <IconBadge icon={item.icon} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.label}</p>
                          {item.subtitle ? (
                            <p className="truncate text-xs text-slate-500 dark:text-white/40">
                              {item.subtitle}
                            </p>
                          ) : null}
                        </div>
                        {item.shortcut ? (
                          <kbd className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-400 dark:border-white/10 dark:text-white/35">
                            {item.shortcut}
                          </kbd>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
