"use client";

import type { ReactNode } from "react";

type Props = {
  mode: "focus" | "edit" | "workspace";
  header?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export default function EditorCanvas({
  mode,
  header,
  toolbar,
  children,
}: Props) {
  if (mode === "focus") {
    return (
      <div className="min-w-0 flex-1 overflow-auto p-6 sm:p-10">
        <div className="mx-auto max-w-[760px] rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)] dark:border-white/[0.06] dark:bg-[#111318]">
          <div className="p-6 sm:p-10">
            {header}
            <div className="mt-4">{children}</div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "workspace") {
    return (
      <div className="min-w-0 max-w-[900px] lg:order-1">
        {header}
        {toolbar}
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  /* edit mode — the manuscript surface */
  return (
    <div className="min-w-0">
      {header}
      {toolbar}
      <div className="px-8 py-8 sm:px-12 sm:py-10">{children}</div>
    </div>
  );
}
