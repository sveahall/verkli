"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";
import {
  EditorContent,
  EditorContext,
  TiptapBubbleMenu as BubbleMenu,
  TiptapFloatingMenu as FloatingMenu,
  useEditor,
} from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { InlineAiAction } from "@/features/book-workspace/types";
import { uploadChapterMedia } from "@/lib/supabase/storage";
import { toTiptapContent } from "@/lib/tiptap-content";
import { FONT_FAMILY_MAP, WRITING_PRESETS } from "./types";

type PresetId = "novel" | "essay" | "screenplay";

type TiptapEditorProps = {
  content: string | Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>) => void;
  placeholder?: string;
  bookId?: string;
  chapterId?: string;
  preset?: string;
  onWordCount?: (count: number) => void;
  onDirty?: () => void;
  onFocusModeToggle?: () => void;
  focusMode?: boolean;
  onInlineAction?: (action: InlineAiAction, selectedText: string) => void;
};

type SlashMenuState = {
  from: number;
  to: number;
  query: string;
};

type SlashCommandId = "scene" | "dialogue" | "summary" | "audio";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  keywords: string[];
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "scene",
    label: "/scene",
    description: "Insert a scene break.",
    keywords: ["divider", "break", "chapter"],
  },
  {
    id: "dialogue",
    label: "/dialogue",
    description: "Start a dialogue beat.",
    keywords: ["character", "quote", "speech"],
  },
  {
    id: "summary",
    label: "/summary",
    description: "Add a summary prompt.",
    keywords: ["outline", "recap", "note"],
  },
  {
    id: "audio",
    label: "/audio",
    description: "Open audiobook generation.",
    keywords: ["voice", "preview", "production"],
  },
];

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.readAsDataURL(file);
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getSelectionText(editor: NonNullable<ReturnType<typeof useEditor>>): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ").trim();
}

const emptySubscribe = () => () => {};

export default function TiptapEditor({
  content,
  onUpdate,
  placeholder = "Start writing...",
  bookId,
  chapterId,
  preset = "novel",
  onWordCount,
  onDirty,
  onInlineAction,
}: TiptapEditorProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: toTiptapContent(content),
    onUpdate: ({ editor }) => {
      onDirty?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(editor.getJSON());
        onWordCount?.(countWords(editor.getText()));
      }, 500);
    },
  });

  const typography = (
    preset && preset in WRITING_PRESETS ? WRITING_PRESETS[preset as PresetId] : null
  ) ?? WRITING_PRESETS.novel;

  const typographyVars = {
    "--verkli-font": FONT_FAMILY_MAP[typography.fontFamily],
    "--verkli-font-size": `${typography.fontSize}px`,
    "--verkli-line-height": String(typography.lineHeight),
    "--verkli-para-spacing": `${typography.paragraphSpacing}rem`,
    "--verkli-content-width": `${typography.contentWidth}ch`,
  } as React.CSSProperties;

  useEffect(() => {
    if (editor) {
      onWordCount?.(countWords(editor.getText()));
    }
  }, [editor, onWordCount]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editor) return;

    const updateSlashMenu = () => {
      const { selection } = editor.state;
      if (!selection.empty) {
        setSlashMenu(null);
        return;
      }

      const { $from } = selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
      const match = textBefore.match(/(?:^|\s)\/([a-z]*)$/i);

      if (!match) {
        setSlashMenu(null);
        return;
      }

      const query = (match[1] ?? "").toLowerCase();
      const from = selection.from - query.length - 1;

      setSlashMenu({
        from,
        to: selection.from,
        query,
      });
    };

    updateSlashMenu();
    editor.on("selectionUpdate", updateSlashMenu);
    editor.on("transaction", updateSlashMenu);

    return () => {
      editor.off("selectionUpdate", updateSlashMenu);
      editor.off("transaction", updateSlashMenu);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;

    const insertImage = async (file: File) => {
      let src: string;

      if (bookId && chapterId) {
        const { url, error } = await uploadChapterMedia(file, bookId, chapterId);
        src = !error && url ? url : (await readAsDataURL(file)) ?? "";
      } else {
        src = (await readAsDataURL(file)) ?? "";
      }

      if (src) {
        editor.chain().focus().setImage({ src }).run();
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();

      if (!file) return;
      event.preventDefault();
      void insertImage(file);
    };

    const handleDrop = (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file?.type.startsWith("image/")) return;
      event.preventDefault();
      void insertImage(file);
    };

    element.addEventListener("paste", handlePaste as EventListener);
    element.addEventListener("drop", handleDrop);

    return () => {
      element.removeEventListener("paste", handlePaste as EventListener);
      element.removeEventListener("drop", handleDrop);
    };
  }, [bookId, chapterId, editor]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashMenu) return [];

    const query = slashMenu.query.trim();
    if (!query) return SLASH_COMMANDS;

    return SLASH_COMMANDS.filter((command) => {
      const haystack = [command.id, command.label, ...command.keywords].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [slashMenu]);

  const runInlineAction = (action: InlineAiAction) => {
    if (!editor) return;
    const selectedText = getSelectionText(editor);
    if (!selectedText) return;
    onInlineAction?.(action, selectedText);
  };

  const runSlashCommand = (commandId: SlashCommandId) => {
    if (!editor || !slashMenu) return;

    const chain = editor.chain().focus().deleteRange({
      from: slashMenu.from,
      to: slashMenu.to,
    });

    switch (commandId) {
      case "scene":
        chain.setHorizontalRule().run();
        break;
      case "dialogue":
        chain.insertContent('Character: ""').run();
        break;
      case "summary":
        chain.insertContent("Summary: ").run();
        break;
      case "audio":
        chain.run();
        onInlineAction?.("audiobook", "Chapter audio");
        break;
      default:
        chain.run();
    }

    setSlashMenu(null);
  };

  if (!mounted || !editor) {
    return (
      <div className="verkli-editor" style={typographyVars}>
        <div className="verkli-editor-loading" />
        <style jsx>{`
          .verkli-editor {
            min-height: 100%;
          }

          .verkli-editor-loading {
            min-height: 680px;
            border-radius: 28px;
            background: rgba(226, 232, 240, 0.6);
          }

          @media (prefers-color-scheme: dark) {
            .verkli-editor-loading {
              background: rgba(255, 255, 255, 0.05);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <EditorContext.Provider value={{ editor }}>
    <div className="verkli-editor" style={typographyVars}>
      <BubbleMenu
        shouldShow={({ editor, from, to }) => editor.state.doc.textBetween(from, to, " ").trim().length > 0}
        className="verkli-bubble-menu"
        options={{ placement: "top-start" }}
      >
        <MenuButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </MenuButton>
        <MenuButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </MenuButton>
        <MenuButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </MenuButton>
        <MenuDivider />
        <MenuButton label="Rewrite" onClick={() => runInlineAction("rewrite")}>
          Rewrite
        </MenuButton>
        <MenuButton label="Improve pacing" onClick={() => runInlineAction("pacing")}>
          Pace
        </MenuButton>
        <MenuButton label="Expand" onClick={() => runInlineAction("expand")}>
          Expand
        </MenuButton>
        <MenuButton label="Generate audio" onClick={() => runInlineAction("audiobook")}>
          Audio
        </MenuButton>
      </BubbleMenu>

      <FloatingMenu
        shouldShow={() => Boolean(slashMenu)}
        className="verkli-slash-menu"
        options={{ placement: "bottom-start" }}
      >
        <div className="verkli-slash-panel">
          <p className="verkli-slash-label">Slash commands</p>
          <div className="verkli-slash-items">
            {(filteredSlashCommands.length > 0 ? filteredSlashCommands : SLASH_COMMANDS).map((command) => (
              <button
                key={command.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  runSlashCommand(command.id);
                }}
                className="verkli-slash-item"
              >
                <span className="verkli-slash-title">{command.label}</span>
                <span className="verkli-slash-description">{command.description}</span>
              </button>
            ))}
          </div>
        </div>
      </FloatingMenu>

      <EditorContent editor={editor} className="verkli-content" />

      <style jsx global>{`
        .verkli-editor {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .verkli-content {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
        }

        .verkli-content .ProseMirror {
          min-height: 680px;
          padding: 18px 18px 96px;
          font-family: var(--verkli-font, Georgia, serif);
          font-size: var(--verkli-font-size, 17px);
          line-height: var(--verkli-line-height, 1.7);
          color: #0f172a;
          outline: none;
          max-width: min(var(--verkli-content-width, 72ch), 100%);
          margin: 0 auto;
        }

        .dark .verkli-content .ProseMirror {
          color: rgba(255, 255, 255, 0.86);
        }

        .verkli-content .ProseMirror p {
          margin-bottom: var(--verkli-para-spacing, 0.75em);
        }

        .verkli-content .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }

        .dark .verkli-content .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.25);
        }

        .verkli-content .ProseMirror h1 {
          font-size: 2.2rem;
          font-weight: 700;
          margin: 1.75rem 0 0.9rem;
          letter-spacing: -0.03em;
        }

        .verkli-content .ProseMirror h2 {
          font-size: 1.6rem;
          font-weight: 650;
          margin: 1.4rem 0 0.7rem;
          letter-spacing: -0.025em;
        }

        .verkli-content .ProseMirror h3 {
          font-size: 1.3rem;
          font-weight: 600;
          margin: 1.15rem 0 0.55rem;
        }

        .verkli-content .ProseMirror ul,
        .verkli-content .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }

        .verkli-content .ProseMirror ul {
          list-style-type: disc;
        }

        .verkli-content .ProseMirror ol {
          list-style-type: decimal;
        }

        .verkli-content .ProseMirror blockquote {
          border-left: 3px solid rgba(148, 163, 184, 0.85);
          padding-left: 1rem;
          margin: 1rem 0;
          color: #64748b;
        }

        .dark .verkli-content .ProseMirror blockquote {
          border-color: rgba(255, 255, 255, 0.22);
          color: rgba(255, 255, 255, 0.7);
        }

        .verkli-content .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 18px;
          margin: 1.5rem 0;
        }

        .verkli-content .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #907aff;
          outline-offset: 3px;
        }

        .verkli-content .ProseMirror hr {
          border: none;
          border-top: 2px solid rgba(148, 163, 184, 0.22);
          margin: 2.25rem 0;
        }

        .dark .verkli-content .ProseMirror hr {
          border-color: rgba(255, 255, 255, 0.16);
        }

        .verkli-bubble-menu {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
          backdrop-filter: blur(16px);
        }

        .dark .verkli-bubble-menu {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(15, 17, 23, 0.94);
        }

        .verkli-slash-menu {
          width: min(320px, calc(100vw - 48px));
        }

        .verkli-slash-panel {
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(16px);
          overflow: hidden;
        }

        .dark .verkli-slash-panel {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(15, 17, 23, 0.96);
        }

        .verkli-slash-label {
          padding: 12px 14px 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .verkli-slash-items {
          display: grid;
          gap: 2px;
          padding: 0 8px 8px;
        }

        .verkli-slash-item {
          display: flex;
          width: 100%;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          padding: 10px 12px;
          text-align: left;
          transition: background 120ms ease, color 120ms ease;
        }

        .verkli-slash-item:hover {
          background: rgba(15, 23, 42, 0.04);
        }

        .dark .verkli-slash-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .verkli-slash-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }

        .dark .verkli-slash-title {
          color: rgba(255, 255, 255, 0.92);
        }

        .verkli-slash-description {
          font-size: 12px;
          color: #64748b;
        }

        .dark .verkli-slash-description {
          color: rgba(255, 255, 255, 0.5);
        }

        @media (max-width: 1024px) {
          .verkli-content .ProseMirror {
            min-height: 560px;
            padding: 26px 18px 72px;
          }
        }
      `}</style>
    </div>
    </EditorContext.Provider>
  );
}

function MenuButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-xl px-2.5 text-xs font-medium transition ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden />;
}

function BoldIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
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
