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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,900px)_280px]">
      <div className="space-y-4">
        {chapterRail}
        {editorCanvas}
      </div>
      {aiAssistantPanel ?? null}
    </div>
  );
}
