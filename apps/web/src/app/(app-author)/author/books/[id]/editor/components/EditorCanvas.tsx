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
        <div className="mx-auto max-w-[760px] rounded-3xl border border-black/[0.06] bg-white/60 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1117]/45">
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

  /* edit mode — default for the write view */
  return (
    <div className="min-w-0">
      {header}
      {toolbar}
      <div className="px-8 py-8 sm:px-10 sm:py-10">{children}</div>
    </div>
  );
}
