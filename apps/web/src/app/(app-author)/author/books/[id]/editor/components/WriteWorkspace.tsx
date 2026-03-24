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
    <div className="mx-auto w-full max-w-[820px]">
      {chapterRail && <div className="mb-3">{chapterRail}</div>}
      <div className="min-h-[calc(100vh-14rem)] overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none">
        {editorCanvas}
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
