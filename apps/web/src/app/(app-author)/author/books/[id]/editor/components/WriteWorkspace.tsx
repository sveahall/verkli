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
    <div className="mx-auto w-full min-w-[1200px] max-w-[1200px]">
      {chapterRail && <div className="mb-3">{chapterRail}</div>}
      <div className="min-h-[calc(100vh-16rem)] overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">
        <div className="relative">{editorCanvas}</div>
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
