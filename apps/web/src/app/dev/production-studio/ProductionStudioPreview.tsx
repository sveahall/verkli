"use client";

import { useRef, useState } from "react";
import CoverPanel from "@/app/(app-author)/author/books/[id]/editor/panels/CoverPanel";
import PricingPanel from "@/app/(app-author)/author/books/[id]/editor/panels/PricingPanel";
import PublishPanel from "@/app/(app-author)/author/books/[id]/editor/panels/PublishPanel";
import ReviewPanel from "@/app/(app-author)/author/books/[id]/editor/panels/ReviewPanel";
import type { Tool } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.types";
import BookCoverWorkspace from "@/features/book-production/BookCoverWorkspace";
import { ToastProvider } from "@/components/ui/toast";

const chapters = [
  { id: "synthetic-1", title: "The last ferry", content: "The harbour was quiet. Mira waited beneath the station clock, watching the light move across the water.", order: 0, book_version_id: "synthetic-english" },
  { id: "synthetic-2", title: "A letter from home", content: "Inside the envelope was a map, folded once, and a name she had not heard for twenty years.", order: 1, book_version_id: "synthetic-english" },
];
const versions = [{ id: "synthetic-english", language_code: "en", status: "draft" }];
const title = "The Quiet Harbour";

export default function ProductionStudioPreview() {
  const [panel, setPanel] = useState<Tool>("cover");
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(false);
  const [failSave, setFailSave] = useState(false);
  const [cover, setCover] = useState<string | null>("/demo-assets/covers/01.jpg");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("photographic");
  const [template, setTemplate] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("SEK");
  const [model, setModel] = useState<"book_only" | "per_chapter">("book_only");
  const [savedPricing, setSavedPricing] = useState({ amount: 0, currency: "SEK", model: "book_only" });
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [description, setDescription] = useState("A journey across the water, and a letter that changes everything. Synthetic book data for interface testing.");
  const [published, setPublished] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [publishedCount, setPublishedCount] = useState<number | null>(0);
  const [confirm, setConfirm] = useState<"publish" | "update" | "unpublish" | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(chapters[0].id);
  const pricingDirty = amount !== savedPricing.amount || currency !== savedPricing.currency || model !== savedPricing.model;

  function navigate(next: Tool) {
    if (["cover", "review", "pricing", "publish"].includes(next)) setPanel(next);
    else setMessage(`The ${next} workspace would open here. This fixture keeps all changes local.`);
  }
  async function saveArtwork(file: File) { setCover(URL.createObjectURL(file)); setCrop(null); setEditorOpen(false); }

  return <div className={dark ? "dark" : ""}><ToastProvider><main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8">
    <header className="mx-auto mb-8 max-w-6xl border-b border-border pb-6">
      <p className="text-sm font-semibold">Production studio · synthetic fixture</p>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Actual panels with local artwork and mocked saves. Publishing changes only this page. Editorial review is disabled here to prevent external requests.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => setDark(!dark)}>{dark ? "Use light theme" : "Use dark theme"}</button>
        <button type="button" className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => setCover(cover ? null : "/demo-assets/covers/01.jpg")}>{cover ? "Test missing cover" : "Restore cover"}</button>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={failSave} onChange={(event) => setFailSave(event.target.checked)} /> Simulate save error</label>
      </div>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Fixture panels">
        {(["review", "cover", "pricing", "publish"] as const).map((item) => <button key={item} type="button" onClick={() => setPanel(item)} aria-current={panel === item ? "page" : undefined} className={`min-h-11 rounded-full px-5 text-sm capitalize ${panel === item ? "bg-primary text-primary-foreground" : "border border-border"}`}>{item}</button>)}
      </nav>
      {message && <p className="mt-4 text-sm text-accent-foreground" role="status">{message}</p>}
    </header>
    <div className="@container/book-panel mx-auto max-w-6xl">
      {panel === "cover" && <BookCoverWorkspace localOnly ownerId="synthetic-author" bookId="synthetic-production-book" versionId="synthetic-english" title={title} author="Alex Morgan" chapters={chapters} onOpenWriting={() => navigate("edit")}>
        <CoverPanel coverInputRef={coverInputRef} coverUploading={false} coverError={null} displayCoverUrl={cover} coverDropActive={dropActive} setCoverDropActive={setDropActive} coverAIPrompt={prompt} setCoverAIPrompt={setPrompt} coverAIStyle={style} setCoverAIStyle={setStyle} coverAIGeneratedUrls={generated} coverAIGenerating={false} coverAIError={null} setCoverAIError={() => {}} coverCropSrc={crop} setCoverCropSrc={setCrop} coverAIPreviewUrl={preview} setCoverAIPreviewUrl={setPreview} handleRemoveCover={() => setCover(null)} handleCropSave={saveArtwork} handleCoverChange={(event) => { const file = event.target.files?.[0]; if (file) void saveArtwork(file); }} handleCoverDrop={(event) => { event.preventDefault(); setDropActive(false); const file = event.dataTransfer.files[0]; if (file) void saveArtwork(file); }} handleCoverAIGenerate={() => { setGenerated(["/demo-assets/covers/01.jpg", "/demo-assets/covers/02.jpg", "/demo-assets/covers/03.jpg", "/demo-assets/covers/04.jpg"]); setMessage("Loaded four local example variations. No generation request was made."); }} handleCoverSetFromGenerated={setCover} coverAITemplate={template} setCoverAITemplate={setTemplate} coverAITemplateFields={fields} setCoverAITemplateFields={setFields} coverEditorOpen={editorOpen} setCoverEditorOpen={setEditorOpen} handleEditorSave={saveArtwork} bookId="synthetic-production-book" bookTitle={title} authorName="Alex Morgan" />
      </BookCoverWorkspace>}
      {panel === "pricing" && <PricingPanel chapters={chapters} priceAmountMinor={amount} setPriceAmountMinor={setAmount} priceCurrency={currency} setPriceCurrency={setCurrency} pricingModel={model} setPricingModel={setModel} pricingSaving={false} pricingDirty={pricingDirty} pricingError={pricingError} pricingSaved={!pricingDirty} handleSavePricing={() => { if (failSave) { setPricingError("Could not save pricing. Your changes are still here. Try again."); return; } setPricingError(null); setSavedPricing({ amount, currency, model }); }} isPublished={published} stripeConfigured currentVisibility={visibility} />}
      {panel === "publish" && <PublishPanel bookId="synthetic-production-book" bookTitle={title} bookDescription={description} authorDisplayName="Alex Morgan" coverImageUrl={cover} chapters={chapters} selectedChapterId={selectedChapter} bookVersions={versions} isPublished={published} publishVisibility={visibility} publishedChapterCount={publishedCount} missingPublishRequirements={cover ? [] : ["Ladda upp en omslagsbild"]} publishDisabled={!cover} chapterPublishDisabled={!cover || (publishedCount ?? chapters.length) >= chapters.length} selectedChapterAlreadyPublished={false} visibilityChanged={published} isPublishing={false} publishError={null} confirmPublishAction={confirm} confirmCopy={confirm ? "This fixture only updates local preview state. No book will be published, changed or unpublished." : null} onVisibilityChange={setVisibility} onPublishFull={() => setConfirm("publish")} onPublishChapter={() => { setPublished(true); setPublishedCount((publishedCount ?? 0) + 1); }} onUpdateSettings={() => setConfirm("update")} onUnpublish={() => setConfirm("unpublish")} onConfirm={() => { setPublished(confirm !== "unpublish"); if (confirm === "publish") setPublishedCount(chapters.length); setConfirm(null); setMessage("Local publication state updated. No server request was made."); }} onCancelConfirm={() => setConfirm(null)} onChapterPublishToggle={(chapter, shouldPublish) => setPublishedCount(shouldPublish ? chapter.order + 1 : chapter.order)} onSelectChapter={setSelectedChapter} onOpenCover={() => setPanel("cover")} onNavigate={navigate} priceAmountMinor={savedPricing.amount} priceCurrency={savedPricing.currency} pricingModel={savedPricing.model} onSaveDescription={async (next) => { if (failSave) throw new Error("Synthetic save error"); setDescription(next ?? ""); }} />}
      {panel === "review" && <ReviewPanel bookId="synthetic-production-book" bookTitle={title} chapters={chapters} bookVersions={versions} activeVersion={versions[0]} coverImageUrl={cover} audiobookStatus={null} isPublished={published} printOnDemandSettings={null} pricingModel={savedPricing.model} priceAmountMinor={savedPricing.amount} priceCurrency={savedPricing.currency} marketingCampaigns={[]} onNavigate={navigate} onApplyReview={async () => { throw new Error("Review changes are disabled in this fixture."); }} saveBlocked />}
    </div>
  </main></ToastProvider></div>;
}
