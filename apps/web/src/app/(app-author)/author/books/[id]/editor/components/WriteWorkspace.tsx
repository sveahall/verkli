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
      {chapterRail && <div className="mb-4">{chapterRail}</div>}
      <div className="min-h-[calc(100vh-14rem)] overflow-hidden rounded-3xl border border-black/[0.06] bg-white/60 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1117]/45">
        <div
          aria-hidden="true"
          className="bg-[radial-gradient(circle_at_top_left,rgba(144,122,255,0.10),transparent_45%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.06),transparent_40%)]"
        />
        <div className="relative">{editorCanvas}</div>
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
