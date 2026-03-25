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
        className="reader-chapter-body rounded-[30px] border px-7 py-8 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:px-11 sm:py-11"
        style={bodyStyle as CSSProperties}
      >
        <h2
          className="mb-5 text-center text-[clamp(1.65rem,2.2vw,2.1rem)] font-semibold tracking-tight"
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
