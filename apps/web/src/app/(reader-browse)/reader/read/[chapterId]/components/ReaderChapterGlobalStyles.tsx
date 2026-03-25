"use client";

export default function ReaderChapterGlobalStyles() {
  return (
    <style jsx global>{`
      .reader-chapter-body .tiptap-renderer .ProseMirror {
        font-size: var(--reader-font-size, 16px);
        line-height: var(--reader-line-height, 1.75);
        font-family: var(--reader-font-family, Georgia, serif);
        max-width: 78ch;
        margin-left: auto;
        margin-right: auto;
        color: var(--reader-prose-color, #1e293b);
        text-wrap: pretty;
      }

      .reader-chapter-body .tiptap-renderer .ProseMirror a {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: var(
          --reader-link-underline,
          rgba(100, 116, 139, 0.45)
        );
        text-underline-offset: 2px;
        transition: text-decoration-color 180ms ease;
      }

      .reader-chapter-body .tiptap-renderer .ProseMirror a:hover {
        text-decoration-color: var(
          --reader-link-underline-hover,
          rgba(71, 85, 105, 0.75)
        );
      }

      .reader-chapter-body .tiptap-renderer .ProseMirror p,
      .reader-chapter-body .tiptap-renderer .ProseMirror li,
      .reader-chapter-body .tiptap-renderer .ProseMirror blockquote {
        line-height: var(--reader-line-height, 1.75);
        color: inherit;
      }

      ::highlight(reader-highlight-yellow) {
        background-color: rgba(250, 204, 21, 0.38);
        color: inherit;
      }

      ::highlight(reader-highlight-green) {
        background-color: rgba(134, 239, 172, 0.34);
        color: inherit;
      }

      ::highlight(reader-highlight-blue) {
        background-color: rgba(147, 197, 253, 0.34);
        color: inherit;
      }

      ::highlight(reader-highlight-rose) {
        background-color: rgba(253, 164, 175, 0.34);
        color: inherit;
      }
    `}</style>
  );
}
