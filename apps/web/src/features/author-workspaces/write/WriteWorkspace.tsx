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
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0f1117]/80 dark:shadow-none">
      <div
        className={`grid min-h-[calc(100vh-11rem)] grid-cols-1 xl:h-[calc(100vh-11rem)] ${
          hasAssistant
            ? "xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(640px,1fr)_280px]"
            : "xl:grid-cols-[280px_minmax(0,1fr)]"
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
