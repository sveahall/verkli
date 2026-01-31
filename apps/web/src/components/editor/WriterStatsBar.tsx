"use client";

type Props = {
  wordCount: number;
  sessionWords: number;
  onFocusToggle: () => void;
  focusMode: boolean;
  preset: string;
  onPresetChange: (p: string) => void;
  onNewChapter: () => void;
  onCommandPalette: () => void;
};

const PRESETS = [
  { id: "novel", label: "Novel" },
  { id: "essay", label: "Essay" },
  { id: "screenplay", label: "Screenplay" },
];

export default function WriterStatsBar({
  wordCount,
  sessionWords,
  onFocusToggle,
  focusMode,
  preset,
  onPresetChange,
  onNewChapter,
  onCommandPalette,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/60 bg-slate-50/60 px-4 py-2 dark:border-white/5 dark:bg-white/[0.03]">
      <div className="flex items-center gap-4">
        <button
          onClick={onCommandPalette}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-200/60 dark:text-white/60 dark:hover:bg-white/10"
          title="Command palette"
        >
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] dark:border-white/20">
            ⌘K
          </kbd>
          <span>Commands</span>
        </button>
        <div className="h-4 w-px bg-slate-200 dark:bg-white/10" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 dark:text-white/60">Preset</span>
          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onFocusToggle}
          className={`rounded-md px-2.5 py-1.5 text-xs transition ${
            focusMode
              ? "bg-slate-200 text-slate-900 dark:bg-white/20 dark:text-white"
              : "text-slate-600 hover:bg-slate-200/60 dark:text-white/60 dark:hover:bg-white/10"
          }`}
          title="Focus mode (⌘⇧F)"
        >
          Focus
        </button>
      </div>
      <div className="flex items-center gap-4">
        {sessionWords > 0 && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            +{sessionWords} this session
          </span>
        )}
        <span className="text-xs text-slate-600 dark:text-white/60">
          {wordCount.toLocaleString()} words
        </span>
        <button
          onClick={onNewChapter}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
        >
          New chapter
        </button>
      </div>
    </div>
  );
}
