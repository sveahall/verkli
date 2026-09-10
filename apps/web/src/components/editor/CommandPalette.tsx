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
    return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted dark:bg-card">•</span>;
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
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground dark:bg-card dark:text-foreground">
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
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl dark:border-border dark:bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 dark:border-border">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-muted-foreground">
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
            className="mt-2 w-full border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground dark:text-foreground dark:placeholder:text-muted-foreground"
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
                  <div className="h-8 w-8 rounded-lg bg-muted dark:bg-card" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-32 rounded-full bg-muted dark:bg-card" />
                    <div className="h-3 w-48 rounded-full bg-muted dark:bg-card" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground dark:text-muted-foreground">{emptyMessage}</p>
          ) : (
            groupedItems.map((group) => (
              <div key={group.group} className="pb-2">
                <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-muted-foreground">
                  {group.group}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const itemIndex = ++runningIndex;
                    const isSelected = itemIndex === selected;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => {
                          item.onHighlight?.();
                          setSelected(itemIndex);
                        }}
                        onClick={() => item.onSelect()}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                          isSelected
                            ? "bg-muted text-foreground dark:bg-card dark:text-foreground"
                            : "text-foreground hover:bg-background dark:text-foreground dark:hover:bg-accent"
                        }`}
                      >
                        <IconBadge icon={item.icon} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.label}</p>
                          {item.subtitle ? (
                            <p className="truncate text-xs text-muted-foreground dark:text-muted-foreground">
                              {item.subtitle}
                            </p>
                          ) : null}
                        </div>
                        {item.shortcut ? (
                          <kbd className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground dark:border-border dark:text-muted-foreground">
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
