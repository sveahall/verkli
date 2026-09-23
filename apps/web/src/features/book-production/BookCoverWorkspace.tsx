"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ImageIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { createProductionSettings, type ProductionSettings } from "./model";
import { localDraftSchema, productionDraftKey, readPrintArtwork, pendingProductionDraft, rememberProductionDraft, type BrowserProductionDraft } from "./browser-draft";
import type { ArtworkMap } from "./ProductionCover";
import type { ProductionChapter } from "./ProductionStructure";
import { exportRemoteDraft, loadRemoteDraft, pendingAccountDraft, rememberAccountDraft, RemoteDraftError, resolveAccountDraft, saveRemoteDraft, type AccountDraft, type RemoteEdition } from "./remote-draft";
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
  localOnly?: boolean;
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
      {visited && (props.ownerId && props.versionId ? props.localOnly
        ? <LocalEditionDraft key={`${props.ownerId}:${props.bookId}:${props.versionId}`} {...props} ownerId={props.ownerId} versionId={props.versionId} />
        : <AccountEditionDraft key={`${props.ownerId}:${props.bookId}:${props.versionId}`} {...props} ownerId={props.ownerId} versionId={props.versionId} />
        : <p className={styles.notice}>Create a manuscript edition in Write before preparing its print layout.</p>)}
    </div>
  </div>;
}

function LocalEditionDraft({ bookId, ownerId, versionId, title, author, chapters, onOpenWriting }: Props & { ownerId: string; versionId: string }) {
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

function AccountEditionDraft({ bookId, ownerId, versionId, title, author, chapters, onOpenWriting }: Props & { ownerId: string; versionId: string }) {
  const key = productionDraftKey(ownerId, bookId, versionId);
  const [initial, setInitial] = useState<AccountDraft | null>(null);
  const [remote, setRemote] = useState<RemoteEdition | null>(null);
  const [legacy, setLegacy] = useState<{ settings: ProductionSettings; artwork: ArtworkMap } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsSave, setNeedsSave] = useState(false);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const draftRef = useRef<AccountDraft | null>(null);
  const revisionRef = useRef(0);
  const needsSaveRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const legacyRawRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController(); controllerRef.current = controller;
    async function load() {
      try {
        const edition = await loadRemoteDraft(bookId, versionId, controller.signal);
        if (controller.signal.aborted) return;
        let browserDraft: { settings: ProductionSettings; artwork: ArtworkMap } | null = pendingProductionDraft(key) ?? null;
        try {
          const raw = localStorage.getItem(key); legacyRawRef.current = raw;
          if (!browserDraft && raw) {
            const parsed = localDraftSchema.safeParse(JSON.parse(raw));
            if (parsed.success) browserDraft = parsed.data;
            else setNotice("An older browser layout could not be read. It has been kept in this browser; your account edition is open.");
          }
        } catch { setNotice("The older browser layout could not be checked. Your account edition is available."); }
        const resolved = resolveAccountDraft(edition, pendingAccountDraft(key), browserDraft, createProductionSettings({ title, author }));
        revisionRef.current = resolved.draft.revision;
        needsSaveRef.current = resolved.draft.needsSave;
        draftRef.current = resolved.draft;
        rememberAccountDraft(key, resolved.draft);
        setNeedsSave(resolved.draft.needsSave); setInitial(resolved.draft); setRemote(edition); setLegacy(browserDraft);
        setHasUnsavedEdits(JSON.stringify(resolved.draft.settings) !== JSON.stringify(resolved.draft.savedSettings));
        setConflict(resolved.conflict); setMigrating(resolved.migrating); setLoadError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load this book edition. Retry to keep your saved layout safe.");
      }
    }
    void load();
    return () => controller.abort();
    // Account, book and edition changes remount this component. Renaming the book
    // must not replace an in-progress print layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  function remember(draft: BrowserProductionDraft) {
    const next = { ...draft, revision: revisionRef.current, needsSave: needsSaveRef.current, migration: draftRef.current?.migration };
    draftRef.current = next; rememberAccountDraft(key, next);
    setHasUnsavedEdits(JSON.stringify(draft.settings) !== JSON.stringify(draft.savedSettings));
  }

  function openDraft(draft: AccountDraft) {
    revisionRef.current = draft.revision; needsSaveRef.current = draft.needsSave; draftRef.current = draft;
    rememberAccountDraft(key, draft); setNeedsSave(draft.needsSave); setInitial(draft); setGeneration((value) => value + 1);
    setHasUnsavedEdits(JSON.stringify(draft.settings) !== JSON.stringify(draft.savedSettings));
  }

  function useSavedEdition() {
    if (!remote || busy) return;
    const settings = remote.settings ?? createProductionSettings({ title, author });
    openDraft({ settings, savedSettings: settings, artwork: remote.artwork, revision: remote.revision, needsSave: !remote.settings });
    setConflict(false); setReviewed(false); setMigrating(false);
  }

  async function reviewLatest() {
    setReviewing(true); setNotice(null);
    try {
      const latest = await loadRemoteDraft(bookId, versionId, controllerRef.current?.signal);
      if (controllerRef.current?.signal.aborted) return;
      setRemote(latest); setReviewed(true);
    } catch (cause) { if (!controllerRef.current?.signal.aborted) setNotice(cause instanceof Error ? cause.message : "Could not load the latest saved edition. Your changes are still here."); }
    finally { setReviewing(false); }
  }

  if (!initial) return <section className={styles.accountState} aria-busy={!loadError}>
    <p role={loadError ? "alert" : "status"}>{loadError ?? "Loading the private layout for this edition…"}</p>
    {loadError && <button type="button" className={styles.secondaryButton} onClick={() => { setLoadError(null); setAttempt((value) => value + 1); }}>Retry loading</button>}
  </section>;

  return <>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {migrating ? <section className={styles.accountState}>
      <p>Your browser layout is open. Save edition to upload its artwork and store this layout privately in your account. Your browser copy is kept until saving succeeds.</p>
      {remote?.settings && <button type="button" disabled={busy} className={styles.secondaryButton} onClick={useSavedEdition}>Discard these changes and use saved account edition</button>}
    </section> : legacy && <section className={styles.accountState}>
      <p>An earlier browser-only layout is also available on this device. Your saved account edition is open.</p>
      <button type="button" disabled={busy || conflict || hasUnsavedEdits} className={styles.secondaryButton} onClick={() => {
        if (!remote) return;
        openDraft({ ...legacy, savedSettings: remote.settings ?? createProductionSettings({ title, author }), revision: remote.revision, needsSave: true, migration: true });
        setMigrating(true);
      }}>Open browser layout for migration</button>
      {hasUnsavedEdits && <p>Save your current changes before opening the browser layout.</p>}
    </section>}
    {conflict && <section className={styles.accountState} aria-label="Edition save conflict">
      <p role="alert">A newer version of this edition was saved elsewhere. Your changes are still here. Review the saved edition before choosing which layout to keep.</p>
      <button type="button" disabled={reviewing || busy} className={styles.secondaryButton} onClick={reviewLatest}>{reviewing ? "Loading saved edition…" : "Review latest saved edition"}</button>
      {reviewed && remote && <>
        <SavedEditionReview settings={remote.settings} artwork={remote.artwork} revision={remote.revision} />
        <div className={styles.conflictActions}>
          <button type="button" className={styles.primaryButton} onClick={() => {
            const current = draftRef.current;
            if (!current) return;
            openDraft({ ...current, revision: remote.revision, savedSettings: remote.settings ?? createProductionSettings({ title, author }), needsSave: true });
            setConflict(false); setReviewed(false); setNotice("Your draft is ready. Save edition to replace the version you just reviewed.");
          }}>Keep my draft for the next save</button>
          <button type="button" className={styles.secondaryButton} onClick={useSavedEdition}>Discard my changes and use saved edition</button>
        </div>
      </>}
    </section>}
    <ProductionStudio key={generation} initialSettings={initial.settings} initialSavedSettings={initial.savedSettings} initialArtwork={initial.artwork}
      recoveryNotice={initial.recoveryNotice} onDraftChange={remember} requireSave={needsSave}
      saveBlockedReason={conflict ? "Review the newer saved edition before saving or exporting." : undefined}
      notice="Save edition stores your layout and artwork privately in your account. Check PDF proofs against your printer’s requirements."
      chapters={chapters} onOpenWriting={onOpenWriting} onUpload={readPrintArtwork}
      onSave={async (settings, artwork) => {
        if (conflict) throw new Error("Review the newer saved edition before saving your changes.");
        setBusy(true);
        const signal = controllerRef.current?.signal;
        try {
          const saved = await saveRemoteDraft(bookId, versionId, revisionRef.current, settings, artwork, signal);
          if (signal?.aborted) throw new DOMException("Save interrupted", "AbortError");
          revisionRef.current = saved.revision; needsSaveRef.current = false;
          if (draftRef.current) draftRef.current = { ...draftRef.current, migration: false };
          setNeedsSave(false); setRemote(saved); setMigrating(false); setNotice(null);
          if (migrating) {
            try { if (legacyRawRef.current && localStorage.getItem(key) === legacyRawRef.current) localStorage.removeItem(key); } catch { /* Keep the browser backup if cleanup is unavailable. */ }
            rememberProductionDraft(key, { settings: saved.settings, savedSettings: saved.settings, artwork: saved.artwork });
            setLegacy(null);
          }
          return saved;
        } catch (cause) {
          if (!signal?.aborted && cause instanceof RemoteDraftError && cause.status === 409) { setConflict(true); setReviewed(false); }
          throw cause;
        } finally { setBusy(false); }
      }}
      onBuild={async (kind) => {
        if (conflict) throw new Error("Review the newer saved edition before exporting.");
        try {
          const result = await exportRemoteDraft(bookId, versionId, revisionRef.current, kind, controllerRef.current?.signal);
          const url = URL.createObjectURL(result.blob);
          return { pageCount: kind === "interior" ? result.pageCount : null, interiorUrl: kind === "interior" ? url : null, coverUrl: kind === "cover" ? url : null, notes: result.notes };
        } catch (cause) {
          if (cause instanceof RemoteDraftError && cause.status === 409 && cause.code !== "MANUSCRIPT_CHANGED") { setConflict(true); setReviewed(false); }
          throw cause;
        }
      }} />
  </>;
}

function SavedEditionReview({ settings, artwork, revision }: { settings: ProductionSettings | null; artwork: ArtworkMap; revision: number }) {
  if (!settings) return <p>This account has no saved layout for this edition.</p>;
  return <details className={styles.savedReview} open>
    <summary>Saved edition · revision {revision}</summary>
    <dl>
      <dt>Title</dt><dd>{settings.title || "Untitled"}{settings.subtitle && ` — ${settings.subtitle}`}</dd>
      <dt>Author</dt><dd>{settings.author || "Not entered"}</dd>
      <dt>Publisher</dt><dd>{settings.publisher || "Not entered"}</dd>
      <dt>Edition / year</dt><dd>{[settings.edition, settings.publicationYear].filter(Boolean).join(" · ") || "Not entered"}</dd>
      <dt>ISBN</dt><dd>{settings.isbn || "Not entered"}</dd>
      <dt>Trim / bleed / spine</dt><dd>{settings.trimWidthMm} × {settings.trimHeightMm} mm · {settings.bleedMm} mm bleed · {settings.spineWidthMm ?? "Unset"} mm spine</dd>
      <dt>Type</dt><dd>{settings.font} · {settings.fontSizePt} pt · {settings.leading} line spacing</dd>
      <dt>Margins</dt><dd>{settings.gutterMm} / {settings.outerMarginMm} / {settings.topMarginMm} / {settings.bottomMarginMm} mm (inside / outside / top / bottom)</dd>
      <dt>Back-cover copy</dt><dd>{settings.cover.backText || "None"}</dd>
      <dt>Spine text</dt><dd>{settings.cover.spineText || "None"}</dd>
      <dt>Cover appearance</dt><dd>{settings.cover.background} background · {settings.cover.textColor} type · front title {settings.cover.printTitle ? "included" : "hidden"} · barcode area {settings.cover.reserveBarcode ? "reserved" : "not reserved"}</dd>
      <dt>Chapter starts</dt><dd>{settings.chaptersStartRecto ? "Right-hand pages" : "Next available page"}</dd>
      <dt>Paper / printer notes</dt><dd>{settings.paperNote || "None"}</dd>
      <dt>Copyright</dt><dd>{settings.rightsText || "None"}</dd>
    </dl>
    <div className={styles.reviewArtwork}>{(["front", "back"] as const).map((side) => artwork[side] && <figure key={side}><div role="img" aria-label={`Saved ${side} artwork`} style={{ backgroundImage: `url(${JSON.stringify(artwork[side]?.url)})`, aspectRatio: `${settings.trimWidthMm}/${settings.trimHeightMm}` }} /><figcaption>{side === "front" ? "Front artwork" : "Back artwork"}</figcaption></figure>)}</div>
    {settings.sections.map((section) => <details key={section.id}><summary>{section.title || section.kind} · {section.enabled ? section.placement === "before" ? "Before manuscript" : "After manuscript" : "Excluded"}{section.startRecto ? " · starts on right-hand page" : ""}</summary><p>{section.body || "Generated from the edition details."}</p></details>)}
  </details>;
}
