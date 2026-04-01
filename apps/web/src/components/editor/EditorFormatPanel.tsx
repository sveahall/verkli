"use client";

import { useCallback } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Minus,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { WRITING_PRESETS } from "./types";

type EditorFormatPanelProps = {
  editor: Editor;
  preset: string;
  onPresetChange: (value: string) => void;
};

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
        active
          ? "bg-[#907AFF]/10 text-[#907AFF]"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}

export default function EditorFormatPanel({
  editor,
  preset,
  onPresetChange,
}: EditorFormatPanelProps) {
  const setHeading = useCallback(
    (level: 1 | 2 | 3) => editor.chain().focus().toggleHeading({ level }).run(),
    [editor]
  );

  const currentFont = (editor.getAttributes("textStyle") as Record<string, string>).fontFamily ?? "";
  const currentHeading = [1, 2, 3].find((l) => editor.isActive("heading", { level: l })) ?? 0;

  return (
    <div className="space-y-6 p-4">
      {/* Section: TEXT */}
      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
          Text
        </h3>

        {/* Block type */}
        <select
          value={currentHeading ? `h${currentHeading}` : "p"}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "p") editor.chain().focus().setParagraph().run();
            else setHeading(Number(val.replace("h", "")) as 1 | 2 | 3);
          }}
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-medium text-slate-700 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        {/* Font family */}
        <select
          value={currentFont}
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-medium text-slate-700 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="">Default font</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="'Merriweather', serif">Merriweather</option>
          <option value="'Inter', sans-serif">Inter</option>
          <option value="'Lora', serif">Lora</option>
          <option value="monospace">Monospace</option>
        </select>

        {/* Preset */}
        <select
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-medium text-slate-700 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          {Object.keys(WRITING_PRESETS).map((key) => (
            <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>
          ))}
        </select>
      </section>

      {/* Section: STYLING */}
      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
          Styling
        </h3>
        <div className="grid grid-cols-4 gap-1">
          <FormatButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </FormatButton>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1">
          <FormatButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </FormatButton>
        </div>
      </section>

      {/* Section: ALIGNMENT */}
      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
          Alignment
        </h3>
        <div className="grid grid-cols-4 gap-1">
          <FormatButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="h-4 w-4" />
          </FormatButton>
          <FormatButton label="Align justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="h-4 w-4" />
          </FormatButton>
        </div>
      </section>
    </div>
  );
}
