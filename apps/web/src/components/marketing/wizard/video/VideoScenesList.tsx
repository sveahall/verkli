"use client";

type VideoScene = {
  id: string;
  title: string;
  startMs: number;
  durationMs: number;
  visual: string;
};

function formatTiming(startMs: number, durationMs: number): string {
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.floor((startMs + durationMs) / 1000);
  return `${startSec}s - ${endSec}s`;
}

type VideoScenesListProps = {
  scenes: VideoScene[];
  canGenerateScenes: boolean;
  isBusy: boolean;
  onGenerateScenes: () => void;
};

export default function VideoScenesList({
  scenes,
  canGenerateScenes,
  isBusy,
  onGenerateScenes,
}: VideoScenesListProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Scenes list
        </h3>
        <button
          type="button"
          onClick={onGenerateScenes}
          disabled={!canGenerateScenes || isBusy}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
        >
          {scenes.length > 0 ? "Regenerate scenes" : "Generate scenes"}
        </button>
      </div>

      {scenes.length === 0 ? (
        <p className="text-[12px] text-slate-500 dark:text-white/50">
          Inga scener an - generera scener efter att scriptet ar klart.
        </p>
      ) : (
        <div className="space-y-2">
          {scenes.map((scene) => (
            <article
              key={scene.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
            >
              <p className="font-semibold">
                {scene.title} · {formatTiming(scene.startMs, scene.durationMs)}
              </p>
              <p className="mt-1 leading-relaxed">{scene.visual}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
