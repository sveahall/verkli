"use client";

type VideoBuildStatus =
  | "idle"
  | "selected"
  | "scripted"
  | "scened"
  | "rendering"
  | "ready"
  | "error";

type VideoPreview = {
  id: string;
  label: string;
  durationMs: number;
  createdAt: string;
};

type VideoRenderControlsProps = {
  status: VideoBuildStatus;
  progress: number;
  preview: VideoPreview | null;
  errorMessage: string | null;
  canRender: boolean;
  onRender: () => void;
};

export default function VideoRenderControls({
  status,
  progress,
  preview,
  errorMessage,
  canRender,
  onRender,
}: VideoRenderControlsProps) {
  const isRendering = status === "rendering";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Render controls
        </h3>
        <button
          type="button"
          onClick={onRender}
          disabled={!canRender || isRendering}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRendering ? "Rendering…" : status === "ready" ? "Re-render" : "Render video"}
        </button>
      </div>

      {isRendering && (
        <div className="space-y-2">
          <p className="text-[12px] text-slate-600 dark:text-white/70">
            Rendering video… {progress}%
          </p>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-2 rounded-full bg-slate-900 transition-[width] duration-200 dark:bg-white"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      )}

      {status === "ready" && preview && (
        <p className="text-[12px] text-emerald-700 dark:text-emerald-300">
          Ready: {preview.label} ({Math.round(preview.durationMs / 1000)}s)
        </p>
      )}

      {status === "error" && errorMessage && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/40 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </p>
      )}

      {!isRendering && status !== "ready" && status !== "error" && (
        <p className="text-[12px] text-slate-500 dark:text-white/50">
          Render blir tillgangligt nar scenerna ar klara.
        </p>
      )}
    </section>
  );
}
