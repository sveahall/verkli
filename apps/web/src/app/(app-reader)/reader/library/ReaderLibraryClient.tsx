"use client";

import type { LibraryData } from "./page";
import ReaderLibraryPageView from "@/features/reader/reader-library/ReaderLibraryPageView";

type ReaderLibraryClientProps = {
  initialData: LibraryData;
};

export default function ReaderLibraryClient({
  initialData,
}: ReaderLibraryClientProps) {
  return <ReaderLibraryPageView initialData={initialData} />;
}
