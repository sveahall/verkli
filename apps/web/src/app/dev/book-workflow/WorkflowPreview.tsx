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
import { ImportBookModal, type ImportItem } from "@/components/import/ImportBookModal";
import PricingPanel from "@/app/(app-author)/author/books/[id]/editor/panels/PricingPanel";
import PublishPanel from "@/app/(app-author)/author/books/[id]/editor/panels/PublishPanel";

const PREVIEW_BOOK = "workflow-preview";

function AuthorDetailsPreview() {
  const [ready, setReady] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [price, setPrice] = useState(4900);
  const [currency, setCurrency] = useState("SEK");
  const [model, setModel] = useState<"book_only" | "per_chapter">("book_only");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    const originalFetch = window.fetch;
    const imports: ImportItem[] = [];
    // Install before mounting the forms: even blur/autosave stays local.
    window.fetch = async (input, init) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (requestUrl.pathname === "/api/books/imports") return Response.json({ imports });
      if (requestUrl.pathname === "/api/books/import") {
        const file = init?.body instanceof FormData ? init.body.get("file") : null;
        const item: ImportItem = { id: crypto.randomUUID(), file_name: file instanceof File ? file.name : "Sample.txt", status: "pending", progress: 0, error: null, book_id: null, created_at: new Date().toISOString() };
        imports.unshift(item);
        return Response.json(item);
      }
      if (requestUrl.pathname.startsWith("/rest/v1/")) return Response.json([]);
      return originalFetch(input, init);
    };
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => { window.clearTimeout(readyTimer); window.fetch = originalFetch; };
  }, []);
  if (!ready) return <p role="status">Preparing local forms…</p>;
  return (
    <section aria-label="F1 component preview" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <p className="text-sm text-muted-foreground">F1 component preview · Synthetic data and mocked writes. No import worker, database save or publication.</p>
      <Button onClick={() => setImportOpen(true)}>Preview import</Button>
      <ImportBookModal open={importOpen} onClose={() => setImportOpen(false)} />
      <PricingPanel chapters={[]} priceAmountMinor={price} setPriceAmountMinor={setPrice} priceCurrency={currency} setPriceCurrency={setCurrency}
        pricingModel={model} setPricingModel={setModel} pricingSaving={false} pricingDirty
        pricingError={null} pricingSaved={false} handleSavePricing={() => setSaved(`${price} ${currency} ${model}`)}
        isPublished={false} stripeConfigured={false} currentVisibility="private" />
      <output aria-label="Mock saved pricing">{saved}</output>
      <Button variant="secondary" onClick={() => setPrice(2750)}>Reload sample price</Button>
      <PublishPanel bookId={PREVIEW_BOOK} bookTitle="F1 sample book" bookDescription="Sample description" authorDisplayName="Sample author"
        coverImageUrl={null} chapters={[]} selectedChapterId={null} bookVersions={[]} isPublished={false} publishVisibility="private"
        publishedChapterCount={0} missingPublishRequirements={["Add a chapter before publishing."]} publishDisabled chapterPublishDisabled
        selectedChapterAlreadyPublished={false} visibilityChanged={false} isPublishing={false} publishError={null} confirmPublishAction={null} confirmCopy={null}
        onVisibilityChange={() => {}} onPublishFull={() => {}} onPublishChapter={() => {}} onUpdateSettings={() => {}} onUnpublish={() => {}}
        onConfirm={() => {}} onCancelConfirm={() => {}} onChapterPublishToggle={() => {}} onSelectChapter={() => {}} onOpenCover={() => {}} />
    </section>
  );
}

/** Local component fixture. No credentials, provider requests or book writes. */
export default function WorkflowPreview() {
  const [detailsOpen, setDetailsOpen] = useState(false);
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
        return Response.json({ content: "This is a local UI preview. In your book workspace, the assistant uses your manuscript as context. No AI request was made here.", source: "template", persistence: "temporary", actions: [], context: { chapterId: null, chapterText: null } });
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
        <Image src="/logo-dark.svg?v=20260916" alt="Verkli" width={1429} height={265} className="mb-12 h-auto w-28 dark:hidden" />
        <Image src="/favicon.svg?v=20260916" alt="Verkli" width={1429} height={265} className="mb-12 hidden h-auto w-28 dark:block" />
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
          aside={<AiAssistantPanel initialTemporary bookId={PREVIEW_BOOK} chapterId={null} variant="dock" activeTool="cover" onClose={() => setOpen(false)} />}
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
        <div className="px-4 py-6"><Button variant="secondary" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen}>F1 details</Button></div>
        {detailsOpen && <AuthorDetailsPreview />}
      </div>
    </div>
  );
}
