"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BookOpen, Headphones, ImageIcon, Library, PenLine, Sparkles } from "lucide-react";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import BookWorkflowHeader from "@/app/(app-author)/author/books/[id]/BookWorkflowHeader";
import CoverPanel from "@/app/(app-author)/author/books/[id]/editor/panels/CoverPanel";
import AiAssistantPanel from "@/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel";
import { COVER_TEMPLATES } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.helpers";
import { Button } from "@/components/ui/button";

const PREVIEW_BOOK = "workflow-preview";

/** Local component fixture. No credentials, provider requests or book writes. */
export default function WorkflowPreview() {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string | null>(COVER_TEMPLATES[0].id);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("minimal");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (input === `/api/books/${PREVIEW_BOOK}/ai/chat`) {
        return Response.json({ content: "This is a local UI preview. In your book workspace, the assistant uses your manuscript as context. No AI request was made here.", source: "template" });
      }
      return originalFetch(input, init);
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  useEffect(() => () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); }, [url]);

  function selectFile(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError("Choose a JPG or PNG image.");
      return;
    }
    setUploadError(null);
    setUrl(URL.createObjectURL(file));
  }

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden h-screen border-r border-sidebar-border bg-sidebar p-6 text-sidebar-foreground lg:sticky lg:top-0 lg:block">
        <Image src="/logo-dark.svg" alt="Verkli" width={132} height={36} className="mb-12 h-9 w-auto dark:hidden" />
        <Image src="/favicon.svg" alt="Verkli" width={132} height={36} className="mb-12 hidden h-9 w-auto dark:block" />
        <div className="mb-6 flex items-center gap-3 text-sm"><Library size={18} /> Library</div>
        <p className="mb-5 truncate text-xs text-sidebar-foreground/60">Den sista färjan</p>
        {[{ label: "Write", icon: PenLine }, { label: "AI Assistant", icon: Sparkles }, { label: "Cover", icon: ImageIcon }, { label: "Audio", icon: Headphones }, { label: "Publish", icon: BookOpen }].map(({ label, icon: Icon }) => (
          <div key={label} className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${label === "Cover" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/65"}`}><Icon size={16} />{label}</div>
        ))}
        <p className="mt-12 text-xs leading-relaxed text-sidebar-foreground/60">Local UI preview<br />Sample data only</p>
      </aside>
      <div className="min-w-0">
        <div className="border-b border-border bg-accent/40 px-5 py-2 text-xs text-muted-foreground">UI preview · Cover &amp; assistant · No book is changed. Open your book workspace to use the full workflow.</div>
        <WorkspaceLayout
          header={<div><p className="text-xs text-muted-foreground">Library / Book workspace</p><p className="mt-1 truncate text-sm font-medium">Den sista färjan</p></div>}
          headerRight={<Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}><Sparkles size={15} /> AI Assistant</Button>}
          asideOpen={open} onAsideClose={() => setOpen(false)} asideLabel="AI assistant"
          aside={<AiAssistantPanel bookId={PREVIEW_BOOK} chapterId={null} variant="dock" activeTool="cover" onClose={() => setOpen(false)} />}
          main={<div className="@container/book-panel rounded-2xl border border-border bg-card shadow-surface-sm">
            <BookWorkflowHeader bookId="f992f520-7633-42fa-a3be-9bdeac037b72" activeTool="cover" tools={["edit", "cover", "audiobook", "translate", "pricing", "publish", "review"]} bare compact />
            <div className="px-4 pb-8 pt-6 @min-[680px]/book-panel:px-8 @min-[680px]/book-panel:pt-8">
              <CoverPanel coverInputRef={inputRef} coverUploading={false} coverError={uploadError} displayCoverUrl={url}
                coverDropActive={drop} setCoverDropActive={setDrop} coverAIPrompt={prompt} setCoverAIPrompt={setPrompt}
                coverAIStyle={style} setCoverAIStyle={setStyle} coverAIGeneratedUrls={[]} coverAIGenerating={busy} coverAIError={error} setCoverAIError={setError}
                coverCropSrc={null} setCoverCropSrc={() => setUploadError("Open the book workspace to crop and save your cover.")}
                coverAIPreviewUrl={preview} setCoverAIPreviewUrl={setPreview}
                handleRemoveCover={() => setUrl(null)} handleCropSave={async () => {}}
                handleCoverChange={(event) => selectFile(event.target.files?.[0])}
                handleCoverDrop={(event) => { event.preventDefault(); setDrop(false); selectFile(event.dataTransfer.files[0]); }}
                handleCoverAIGenerate={() => { setBusy(true); setError(null); window.setTimeout(() => { setBusy(false); setError("UI preview only. Open your book workspace to generate covers."); }, 800); }}
                handleCoverSetFromGenerated={setUrl} coverAITemplate={template} setCoverAITemplate={setTemplate}
                coverAITemplateFields={fields} setCoverAITemplateFields={setFields}
                coverEditorOpen={false} setCoverEditorOpen={() => setUploadError("Open the book workspace to edit and save your cover.")}
                handleEditorSave={async () => {}} bookId={PREVIEW_BOOK} bookTitle="Den sista färjan" authorName="Sample author" />
            </div>
          </div>}
        />
      </div>
    </div>
  );
}
