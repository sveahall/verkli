"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
} from "@tiptap/extension-text-style";
import { useEffect, useRef, useState } from "react";

type TiptapEditorProps = {
  content: string | Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>) => void;
  placeholder?: string;
};

export default function TiptapEditor({
  content,
  onUpdate,
  placeholder = "Start writing...",
}: TiptapEditorProps) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Parse initial content
  const getInitialContent = () => {
    if (!content) return "";
    if (typeof content === "string") {
      // Try to parse as JSON first
      try {
        return JSON.parse(content);
      } catch {
        // If not valid JSON, treat as plain text and convert to paragraph
        return content ? `<p>${content}</p>` : "";
      }
    }
    return content;
  };

  const editor = useEditor({
    // Prevent SSR hydration mismatch in Next.js App Router
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextStyle,
      FontFamily.configure({
        types: ["textStyle"],
      }),
      FontSize.configure({
        types: ["textStyle"],
      }),
      LineHeight.configure({
        types: ["textStyle"],
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: getInitialContent(),
    editorProps: {
      attributes: {
        class:
          "prose prose-slate dark:prose-invert max-w-none min-h-[400px] px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced update
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        const json = editor.getJSON();
        onUpdate(json);
      }, 500);
    },
  });

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!editor) {
    return (
      <div className="h-[400px] w-full animate-pulse rounded-lg border border-slate-300 bg-slate-100 dark:border-white/20 dark:bg-white/5" />
    );
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white dark:border-white/20 dark:bg-white/10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-2 dark:border-white/10">
        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <RedoIcon />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Typography */}
        <FontFamilyDropdown editor={editor} />
        <FontSizeDropdown editor={editor} />
        <LineHeightDropdown editor={editor} />

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <BulletListIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <OrderedListIcon />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Blockquote */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <BlockquoteIcon />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Image */}
        <ToolbarButton
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const base64 = event.target?.result as string;
                  editor.chain().focus().setImage({ src: base64 }).run();
                };
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
          title="Insert Image"
        >
          <ImageIcon />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align Left"
        >
          <AlignLeftIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align Center"
        >
          <AlignCenterIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align Right"
        >
          <AlignRightIcon />
        </ToolbarButton>

      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Placeholder styling */}
      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: "${placeholder}";
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .dark .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.3);
        }
        .ProseMirror {
          min-height: 400px;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul {
          list-style-type: disc;
        }
        .ProseMirror ol {
          list-style-type: decimal;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #907aff;
          padding-left: 1rem;
          margin-left: 0;
          margin-right: 0;
          font-style: italic;
          color: #64748b;
        }
        .dark .ProseMirror blockquote {
          color: rgba(255, 255, 255, 0.6);
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #907aff;
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

// Toolbar button component
function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
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
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm font-medium transition ${
        active
          ? "bg-slate-200 text-slate-900 dark:bg-white/20 dark:text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />;
}

// Icons
function BoldIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v7a5 5 0 0010 0V4M5 20h14" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" />
      <text x="2" y="7" fontSize="6" fill="currentColor">1</text>
      <text x="2" y="13" fontSize="6" fill="currentColor">2</text>
      <text x="2" y="19" fontSize="6" fill="currentColor">3</text>
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function AlignLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M5 18h14" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M10 12h10M6 18h14" />
    </svg>
  );
}

// Typography dropdown components
const FONT_FAMILY_PRESETS = [
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

function FontFamilyDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!editor) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Font family"
        className="flex h-8 min-w-8 items-center rounded px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      >
        Font
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded border border-slate-200 bg-white py-1 dark:border-white/10 dark:bg-slate-800">
            {FONT_FAMILY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  editor.chain().focus().setFontFamily(preset.value).run();
                  setIsOpen(false);
                }}
                className="flex w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
                style={{ fontFamily: preset.value }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const FONT_SIZE_PRESETS = [
  { label: "Small", value: "14px" },
  { label: "Normal", value: "16px" },
  { label: "Large", value: "18px" },
];

function FontSizeDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!editor) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Font size"
        className="flex h-8 min-w-8 items-center rounded px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      >
        Size
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded border border-slate-200 bg-white py-1 dark:border-white/10 dark:bg-slate-800">
            {FONT_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  editor.chain().focus().setFontSize(preset.value).run();
                  setIsOpen(false);
                }}
                className="flex w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const LINE_HEIGHT_PRESETS = [
  { label: "Tight", value: "1.25" },
  { label: "Normal", value: "1.5" },
  { label: "Relaxed", value: "1.75" },
];

function LineHeightDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!editor) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Line height"
        className="flex h-8 min-w-8 items-center rounded px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      >
        Line
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded border border-slate-200 bg-white py-1 dark:border-white/10 dark:bg-slate-800">
            {LINE_HEIGHT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  editor.chain().focus().setLineHeight(preset.value).run();
                  setIsOpen(false);
                }}
                className="flex w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
