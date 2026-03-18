"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function AiAssistantPanel({ children }: Props) {
  return (
    <aside className="space-y-4 lg:order-2 lg:sticky lg:top-28 lg:self-start">
      {children}
    </aside>
  );
}
