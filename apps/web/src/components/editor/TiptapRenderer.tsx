"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
} from "@tiptap/extension-text-style";
import { toTiptapContent } from "@/lib/tiptap-content";

type TiptapRendererProps = {
  content: string | Record<string, unknown> | null;
  className?: string;
};

export default function TiptapRenderer({ content, className = "" }: TiptapRendererProps) {
  const parsedContent = useMemo(() => toTiptapContent(content), [content]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize.configure({ types: ["textStyle"] }),
      LineHeight.configure({ types: ["textStyle"] }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: parsedContent,
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(parsedContent);
  }, [editor, parsedContent]);

  if (!editor) {
    return (
      <div className={`animate-pulse rounded bg-slate-100 dark:bg-white/5 h-32 ${className}`} />
    );
  }

  return (
    <div className={`tiptap-renderer ${className}`}>
      <EditorContent editor={editor} />

      <style jsx global>{`
        .tiptap-renderer .ProseMirror {
          outline: none;
        }
        .tiptap-renderer .ProseMirror h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: inherit;
        }
        .tiptap-renderer .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          color: inherit;
        }
        .tiptap-renderer .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: inherit;
        }
        .tiptap-renderer .ProseMirror p {
          margin-bottom: 0.75rem;
          line-height: 1.75;
        }
        .tiptap-renderer .ProseMirror ul,
        .tiptap-renderer .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .tiptap-renderer .ProseMirror ul {
          list-style-type: disc;
        }
        .tiptap-renderer .ProseMirror ol {
          list-style-type: decimal;
        }
        .tiptap-renderer .ProseMirror li {
          margin-bottom: 0.25rem;
        }
        .tiptap-renderer .ProseMirror blockquote {
          border-left: 3px solid #907aff;
          padding-left: 1rem;
          margin-left: 0;
          margin-right: 0;
          font-style: italic;
          color: #64748b;
        }
        .dark .tiptap-renderer .ProseMirror blockquote {
          color: rgba(255, 255, 255, 0.6);
        }
        .tiptap-renderer .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .tiptap-renderer .ProseMirror hr {
          border: none;
          border-top: 2px solid #e2e8f0;
          margin: 2rem 0;
        }
        .dark .tiptap-renderer .ProseMirror hr {
          border-color: rgba(255,255,255,0.15);
        }
        .tiptap-renderer .ProseMirror strong {
          font-weight: 600;
        }
        .tiptap-renderer .ProseMirror em {
          font-style: italic;
        }
        .tiptap-renderer .ProseMirror u {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
