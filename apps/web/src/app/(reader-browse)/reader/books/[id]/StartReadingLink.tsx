"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY_PREFIX = "verkli_reading_";

type Props = {
  bookId: string;
  firstChapterId: string | null;
  serverChapterId: string | null;
};

function getLocalChapterId(bookId: string): string | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${bookId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.chapterId) return parsed.chapterId as string;
    }
  } catch {
    // ignore
  }
  return null;
}

// Noop subscribe – localStorage value is only read once at mount
const subscribeNoop = () => () => {};

export default function StartReadingLink({
  bookId,
  firstChapterId,
  serverChapterId,
}: Props) {
  // Read localStorage-persisted chapter without useEffect + setState,
  // avoiding "setState synchronously within an effect" warnings.
  const localChapterId = useSyncExternalStore(
    subscribeNoop,
    () => (serverChapterId ? null : getLocalChapterId(bookId)),
    () => null,
  );
  const chapterId = serverChapterId ?? localChapterId ?? firstChapterId;

  const targetChapterId = chapterId ?? firstChapterId;
  const isContinue = chapterId && chapterId !== firstChapterId;

  if (!targetChapterId) {
    return (
      <span className="rounded-full bg-slate-200 px-6 py-3 text-[14px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/50">
        No chapters yet
      </span>
    );
  }

  return (
    <Link
      href={`/reader/read/${targetChapterId}`}
      className="inline-flex h-11 min-h-11 w-fit shrink-0 items-center justify-center self-start rounded-xl bg-[#907AFF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8069EE] hover:shadow"
    >
      {isContinue ? "Continue reading" : "Start reading"}
    </Link>
  );
}
