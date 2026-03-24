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
        <div className="mx-auto max-w-[720px]">
          {header}
          {children}
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
      <div className="px-8 py-8 sm:px-12 sm:py-10">{children}</div>
    </div>
  );
}
