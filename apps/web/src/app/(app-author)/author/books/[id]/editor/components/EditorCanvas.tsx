"use client";

import type { ReactNode } from "react";

type Props = {
  mode: "focus" | "edit" | "workspace";
  header?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export default function EditorCanvas({ mode, header, toolbar, children }: Props) {
  if (mode === "focus") {
    return (
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[1100px]">
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
        {children}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {header}
      {toolbar}
      {children}
    </div>
  );
}
