"use client";

export default function ReaderChapterGlobalStyles() {
  return (
    <style jsx global>{`
      .reader-chapter-body .tiptap-renderer .ProseMirror {
        font-size: var(--reader-font-size, 16px);
        line-height: var(--reader-line-height, 1.75);
        font-family: var(--reader-font-family, Georgia, serif);
        /* The old 78ch never bound: the container caps the column at 638px,
           which measured at 90 characters a line — well past the band where
           the eye reliably finds the next line start.

           The ch unit is the zero glyph, and in Georgia that is far wider than the
           average letter, so the unit overstates the measure by roughly a
           third. Measured against this book at 16px Georgia: 52ch renders 76
           characters, 48ch renders 70, 46ch renders 66. 47ch sits mid-band.
           Still ch rather than px, so the measure holds when the reader
           changes text size. */
        max-width: 47ch;
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
