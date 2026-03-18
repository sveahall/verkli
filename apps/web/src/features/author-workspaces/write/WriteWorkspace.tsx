import type { ReactNode } from "react";

type WriteWorkspaceProps = {
  chapterRail: ReactNode;
  editorCanvas: ReactNode;
  aiAssistant: ReactNode;
};

export default function WriteWorkspace({
  chapterRail,
  editorCanvas,
  aiAssistant,
}: WriteWorkspaceProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-black/[0.06] bg-white/80 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0f1117]/80">
      <div className="grid min-h-[calc(100vh-11rem)] grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(700px,1fr)_300px]">
        <aside className="border-b border-black/[0.06] dark:border-white/[0.06] xl:border-b-0 xl:border-r">
        {chapterRail}
        </aside>
        <div className="min-w-0 border-b border-black/[0.06] dark:border-white/[0.06] xl:border-b-0 2xl:border-r">
          {editorCanvas}
        </div>
        <aside className="xl:col-span-2 2xl:col-span-1">{aiAssistant}</aside>
      </div>
    </div>
  );
}
