"use client";

import type { ReactNode } from "react";

type Props = {
  chapterRail?: ReactNode;
  editorCanvas: ReactNode;
  aiAssistantPanel?: ReactNode;
};

export default function WriteWorkspace({
  chapterRail,
  editorCanvas,
  aiAssistantPanel,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,860px)_260px]">
      <div className="space-y-3">
        {chapterRail}
        <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
          {editorCanvas}
        </div>
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
