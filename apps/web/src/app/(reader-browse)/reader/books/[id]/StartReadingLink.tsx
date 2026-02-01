"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY_PREFIX = "verkli_reading_";

type Props = {
  bookId: string;
  firstChapterId: string | null;
  serverChapterId: string | null;
};

export default function StartReadingLink({
  bookId,
  firstChapterId,
  serverChapterId,
}: Props) {
  const [chapterId, setChapterId] = useState<string | null>(serverChapterId ?? firstChapterId);

  useEffect(() => {
    if (serverChapterId) return;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${bookId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.chapterId) setChapterId(parsed.chapterId);
      }
    } catch (_) {}
  }, [bookId, serverChapterId]);

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
      className="rounded-full bg-[#907AFF] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE]"
    >
      {isContinue ? "Continue reading" : "Start reading"}
    </Link>
  );
}
