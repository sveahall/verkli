import type { ReactNode } from "react";

type WriteWorkspaceProps = {
  chapterRail: ReactNode;
  editorCanvas: ReactNode;
  aiAssistant?: ReactNode;
};

export default function WriteWorkspace({
  chapterRail,
  editorCanvas,
  aiAssistant,
}: WriteWorkspaceProps) {
  const hasAssistant = Boolean(aiAssistant);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-black/[0.06] bg-white/65 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1117]/55">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(144,122,255,0.10),transparent_45%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.06),transparent_40%)]"
      />
      <div
        className={`relative grid min-h-[calc(100vh-11rem)] grid-cols-1 xl:h-[calc(100vh-11rem)] ${
          hasAssistant
            ? "xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(640px,1fr)_320px]"
            : "xl:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        <aside className="min-h-0 overflow-hidden border-b border-black/[0.06] dark:border-white/[0.06] xl:border-b-0 xl:border-r">
          {chapterRail}
        </aside>
        <div
          className={`min-h-0 min-w-0 overflow-hidden ${
            hasAssistant
              ? "border-b border-black/[0.06] dark:border-white/[0.06] xl:border-b-0 2xl:border-r"
              : ""
          }`}
        >
          {editorCanvas}
        </div>
        {hasAssistant && (
          <aside className="min-h-0 xl:col-span-2 2xl:col-span-1">
            {aiAssistant}
          </aside>
        )}
      </div>
    </div>
  );
}
