"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  memo,
  type CSSProperties,
} from "react";

const TiptapRenderer = dynamic(
  () => import("@/components/editor/TiptapRenderer"),
  { ssr: false }
);

type ReaderChapterBodyProps = {
  chapterTitle: string;
  chapterContent: string | Record<string, unknown> | null;
  bodyStyle: Record<string, string>;
};

const ReaderChapterBody = memo(
  forwardRef<HTMLDivElement, ReaderChapterBodyProps>(function ReaderChapterBody(
    { chapterTitle, chapterContent, bodyStyle },
    ref
  ) {
    return (
      <div
        ref={ref}
        className="reader-chapter-body rounded-2xl border border-black/[0.06] bg-white px-6 py-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03] sm:px-10 sm:py-10"
        style={bodyStyle as CSSProperties}
      >
        <h2
          className="mb-6 text-center text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "var(--reader-heading-color, #0f172a)" }}
        >
          {chapterTitle}
        </h2>
        {chapterContent ? (
          <TiptapRenderer content={chapterContent} />
        ) : (
          <p className="text-[15px] text-slate-600 dark:text-white/60">
            No content yet.
          </p>
        )}
      </div>
    );
  })
);

ReaderChapterBody.displayName = "ReaderChapterBody";

export default ReaderChapterBody;
