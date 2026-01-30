import type { ReactNode } from "react";
import ReaderAppShell from "@/components/reader/ReaderAppShell";

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return <ReaderAppShell>{children}</ReaderAppShell>;
}
