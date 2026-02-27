"use client";

type VideoScriptEditorProps = {
  script: string;
  canGenerateScript: boolean;
  isBusy: boolean;
  onChangeScript: (value: string) => void;
  onGenerateScript: () => void;
};

export default function VideoScriptEditor({
  script,
  canGenerateScript,
  isBusy,
  onChangeScript,
  onGenerateScript,
}: VideoScriptEditorProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Script editor
        </h3>
        <button
          type="button"
          onClick={onGenerateScript}
          disabled={!canGenerateScript || isBusy}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
        >
          {script.trim().length > 0 ? "Regenerate script" : "Generate script"}
        </button>
      </div>

      <textarea
        className="input-base min-h-[160px] resize-y"
        value={script}
        onChange={(event) => onChangeScript(event.target.value)}
        placeholder="Generate script from selected text, then edit manually."
      />
    </section>
  );
}
