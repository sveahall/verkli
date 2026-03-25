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
    <div className="mx-auto w-full max-w-[960px]">
      {chapterRail && <div className="mb-4">{chapterRail}</div>}
      <div className="min-h-[calc(100vh-14rem)] overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none">
        {editorCanvas}
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
