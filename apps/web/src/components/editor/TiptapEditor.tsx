"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { uploadChapterMedia } from "@/lib/supabase/storage";

type TiptapEditorProps = {
  content: string | Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>) => void;
  placeholder?: string;
  bookId?: string;
  chapterId?: string;
};

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string) ?? "");
    r.readAsDataURL(file);
  });
}

export default function TiptapEditor({
  content,
  onUpdate,
  placeholder = "Start writing...",
  bookId,
  chapterId,
}: TiptapEditorProps) {
  const [mounted, setMounted] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getInitialContent = () => {
    if (!content) return "";
    if (typeof content === "string") {
      try {
        return JSON.parse(content);
      } catch {
        return content ? `<p>${content}</p>` : "";
      }
    }
    return content;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: getInitialContent(),
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(editor.getJSON());
      }, 500);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Paste and drop images
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;

    const insertImage = async (file: File) => {
      let src: string;
      if (bookId && chapterId) {
        const { url, error } = await uploadChapterMedia(file, bookId, chapterId);
        src = !error && url ? url : (await readAsDataURL(file)) ?? "";
      } else {
        src = (await readAsDataURL(file)) ?? "";
      }
      if (src) editor.chain().focus().setImage({ src }).run();
    };

    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (file) {
        e.preventDefault();
        insertImage(file);
      }
    };

    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) {
        e.preventDefault();
        insertImage(file);
      }
    };

    el.addEventListener("paste", onPaste as EventListener);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("paste", onPaste as EventListener);
      el.removeEventListener("drop", onDrop);
    };
  }, [editor, bookId, chapterId]);

  // Loading state - matches final editor styling
  if (!mounted || !editor) {
    return (
      <div className="verkli-editor">
        <div className="verkli-editor-loading" />
        <style jsx>{`
          .verkli-editor {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #fff;
            overflow: hidden;
          }
          .verkli-editor-loading {
            min-height: 500px;
          }
          @media (prefers-color-scheme: dark) {
            .verkli-editor {
              border-color: rgba(255,255,255,0.1);
              background: rgba(15,23,42,0.5);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="verkli-editor">
      {/* Toolbar */}
      <div className="verkli-toolbar">
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <UndoIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <RedoIcon />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <BoldIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <ItalicIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          H1
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          H2
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          H3
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <ListIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered List">
          <OrderedListIcon />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
          <QuoteIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule (scene break)">
          <HrIcon />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              let src: string;
              if (bookId && chapterId) {
                const { url, error } = await uploadChapterMedia(file, bookId, chapterId);
                src = !error && url ? url : (await readAsDataURL(file)) ?? "";
              } else {
                src = (await readAsDataURL(file)) ?? "";
              }
              if (src) editor.chain().focus().setImage({ src }).run();
            };
            input.click();
          }}
          title="Insert image"
        >
          <ImageIcon />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">
          <AlignLeftIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">
          <AlignCenterIcon />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">
          <AlignRightIcon />
        </ToolbarBtn>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="verkli-content" />

      <style jsx global>{`
        .verkli-editor {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          overflow: hidden;
        }
        .dark .verkli-editor {
          border-color: rgba(255,255,255,0.1);
          background: rgba(15,23,42,0.5);
        }
        .verkli-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 2px;
          padding: 8px 12px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .dark .verkli-toolbar {
          border-color: rgba(255,255,255,0.1);
          background: rgba(30,41,59,0.5);
        }
        .verkli-content .ProseMirror {
          min-height: 500px;
          padding: 32px 40px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 17px;
          line-height: 1.7;
          color: #1e293b;
          outline: none;
        }
        .dark .verkli-content .ProseMirror {
          color: #e2e8f0;
        }
        .verkli-content .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .verkli-content .ProseMirror p {
          margin-bottom: 0.75em;
        }
        .verkli-content .ProseMirror h1 {
          font-size: 2rem;
          font-weight: 700;
          margin: 1.5rem 0 0.75rem;
        }
        .verkli-content .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem;
        }
        .verkli-content .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 1rem 0 0.5rem;
        }
        .verkli-content .ProseMirror ul,
        .verkli-content .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .verkli-content .ProseMirror ul { list-style-type: disc; }
        .verkli-content .ProseMirror ol { list-style-type: decimal; }
        .verkli-content .ProseMirror blockquote {
          border-left: 3px solid #94a3b8;
          padding-left: 1rem;
          margin: 1rem 0;
          font-style: italic;
          color: #64748b;
        }
        .dark .verkli-content .ProseMirror blockquote {
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.7);
        }
        .verkli-content .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 1rem 0;
        }
        .verkli-content .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #64748b;
          outline-offset: 2px;
        }
        .verkli-content .ProseMirror hr {
          border: none;
          border-top: 2px solid #e2e8f0;
          margin: 2rem 0;
        }
        .dark .verkli-content .ProseMirror hr {
          border-color: rgba(255,255,255,0.15);
        }
      `}</style>
    </div>
  );
}

// Simple toolbar button
function ToolbarBtn({ onClick, active, disabled, title, children }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm font-medium transition
        ${active ? "bg-slate-200 text-slate-900 dark:bg-white/20 dark:text-white" : "text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />;
}

// Icons
function BoldIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" /></svg>;
}
function ItalicIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" /></svg>;
}
function UnderlineIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 4v7a5 5 0 0010 0V4M5 20h14" /></svg>;
}
function ListIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" /></svg>;
}
function OrderedListIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" /></svg>;
}
function QuoteIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>;
}
function UndoIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>;
}
function RedoIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" /></svg>;
}
function ImageIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function AlignLeftIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" /></svg>;
}
function AlignCenterIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M5 18h14" /></svg>;
}
function AlignRightIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M10 12h10M6 18h14" /></svg>;
}
function HrIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" /></svg>;
}
