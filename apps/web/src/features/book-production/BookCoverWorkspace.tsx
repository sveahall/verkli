"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ImageIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { createProductionSettings } from "./model";
import { localDraftSchema, productionDraftKey, readPrintArtwork, pendingProductionDraft, rememberProductionDraft, type BrowserProductionDraft } from "./browser-draft";
import type { ArtworkMap } from "./ProductionCover";
import type { ProductionChapter } from "./ProductionStructure";
import styles from "./ProductionStudio.module.css";

const ProductionStudio = dynamic(() => import("./ProductionStudio"), {
  loading: () => <p role="status" className="py-10 text-sm text-muted-foreground">Opening book layout…</p>,
});

type Props = {
  bookId: string;
  ownerId?: string;
  versionId: string | null;
  title: string;
  author: string;
  chapters: ProductionChapter[];
  onOpenWriting: () => void;
  children: ReactNode;
};

export default function BookCoverWorkspace(props: Props) {
  const query = useSearchParams();
  const [tab, setTab] = useState(query.get("layout") === "print" ? "print" : "artwork");
  const [visited, setVisited] = useState(tab === "print");
  return <div className={styles.studio}>
    <div className={styles.workspaceTabs} role="tablist" aria-label="Cover workspace">
      {(["artwork", "print"] as const).map((id) => <button key={id} id={`cover-workspace-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`cover-workspace-panel-${id}`} tabIndex={tab === id ? 0 : -1}
        onClick={() => { setTab(id); if (id === "print") setVisited(true); }}
        onKeyDown={(event) => { const target = event.key === "ArrowLeft" || event.key === "ArrowRight" ? (id === "artwork" ? "print" : "artwork") : event.key === "Home" ? "artwork" : event.key === "End" ? "print" : null; if (target) { event.preventDefault(); setTab(target); setVisited(true); document.getElementById(`cover-workspace-${target}`)?.focus(); } }}>
        {id === "artwork" ? <ImageIcon size={17} aria-hidden /> : <BookOpen size={17} aria-hidden />}{id === "artwork" ? "Digital cover" : "Print & book layout"}
      </button>)}
    </div>
    <div role="tabpanel" id="cover-workspace-panel-artwork" aria-labelledby="cover-workspace-artwork" hidden={tab !== "artwork"}>{props.children}</div>
    <div role="tabpanel" id="cover-workspace-panel-print" aria-labelledby="cover-workspace-print" hidden={tab !== "print"}>
      {visited && (props.ownerId && props.versionId ? <EditionDraft key={`${props.ownerId}:${props.bookId}:${props.versionId}`} {...props} ownerId={props.ownerId} versionId={props.versionId} /> : <p className={styles.notice}>Create a manuscript edition in Write before preparing its print layout.</p>)}
    </div>
  </div>;
}

function EditionDraft({ bookId, ownerId, versionId, title, author, chapters, onOpenWriting }: Props & { ownerId: string; versionId: string }) {
  const key = productionDraftKey(ownerId, bookId, versionId);
  const [initial, setInitial] = useState<BrowserProductionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let draft = { settings: createProductionSettings({ title, author }), artwork: {} as ArtworkMap };
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = localDraftSchema.safeParse(JSON.parse(raw));
          if (parsed.success) draft = parsed.data;
          else setError("This browser’s saved layout could not be read. A fresh layout is open; saving will replace the unreadable draft.");
        }
      } catch { setError("Browser storage is unavailable. You can work on this layout, but saving may fail. Keep this page open until you have saved successfully."); }
      setInitial(pendingProductionDraft(key) ?? { ...draft, savedSettings: draft.settings });
    });
    return () => cancelAnimationFrame(frame);
    // The component is keyed by the account, book and edition. Renaming a book
    // must not replace a print layout the author is currently editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {initial ? <ProductionStudio initialSettings={initial.settings} initialSavedSettings={initial.savedSettings} recoveryNotice={initial.recoveryNotice} initialArtwork={initial.artwork} onDraftChange={(draft) => rememberProductionDraft(key, draft)} chapters={chapters} localPreview
      localNotice="Layout draft — saved only in this browser for this book edition. It is not synced to other devices. PDF export is not available yet."
      onOpenWriting={onOpenWriting} onUpload={readPrintArtwork}
      onSave={async (settings, artwork) => {
        const draft = localDraftSchema.parse({ settings, artwork });
        try { localStorage.setItem(key, JSON.stringify(draft)); setError(null); }
        catch { throw new Error("Could not save this layout in your browser. Storage may be full or disabled. Your changes are still here; keep this page open and try smaller artwork."); }
      }} /> : <p role="status" className="py-10 text-sm text-muted-foreground">Opening this edition’s layout…</p>}
  </>;
}
