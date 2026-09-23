import { z } from "zod";
import { productionSettingsSchema, type ProductionSettings } from "./model";
import { rememberProductionDraft, type BrowserProductionDraft } from "./browser-draft";
import type { ArtworkMap, ArtworkSide, ProductionArtwork } from "./ProductionCover";

export type ProductionExportKind = "interior" | "cover";
export type AccountDraft = BrowserProductionDraft & { revision: number; needsSave: boolean; migration?: boolean };
export type RemoteEdition = { settings: ProductionSettings | null; revision: number; artwork: ArtworkMap };
export type SavedEdition = { settings: ProductionSettings; revision: number; artwork: ArtworkMap };

const artworkSchema = z.object({
  path: z.string().min(1).max(512).regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/)
    .refine((path) => path.split("/").every((part) => part && part !== "." && part !== "..")),
  url: z.string().url().max(8000).refine((url) => /^https?:\/\//.test(url)),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});
const editionSchema = z.object({
  settings: productionSettingsSchema.nullable(),
  revision: z.number().int().nonnegative(),
  artwork: z.object({ front: artworkSchema.optional(), back: artworkSchema.optional() }),
}).superRefine((edition, context) => {
  if ((edition.settings === null) !== (edition.revision === 0)) context.addIssue({ code: "custom", message: "Missing edition revision." });
  for (const side of ["front", "back"] as const) {
    const path = edition.settings?.cover[side === "front" ? "frontPath" : "backPath"] ?? null;
    if ((edition.artwork[side]?.path ?? null) !== path) context.addIssue({ code: "custom", message: "Artwork does not match this edition." });
  }
});

export class RemoteDraftError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = "RemoteDraftError"; }
}

function endpoint(bookId: string, versionId: string, suffix = "") {
  return `/api/author/books/${encodeURIComponent(bookId)}/production${suffix}?versionId=${encodeURIComponent(versionId)}`;
}

async function request(url: string, options: RequestInit) {
  try { return await fetch(url, options); }
  catch (cause) {
    if (options.signal?.aborted || cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new RemoteDraftError("Could not reach your account. Check your connection and retry; your draft has been kept.", 0);
  }
}

async function failure(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  let code: string | undefined;
  try {
    const body = await response.json();
    if (typeof body.error === "string") code = body.error;
    if (typeof body.message === "string") message = body.message;
    else if (typeof body.error === "string") message = body.error;
  } catch { /* An HTML error page must not replace the useful fallback. */ }
  throw new RemoteDraftError(message, response.status, code);
}

export async function loadRemoteDraft(bookId: string, versionId: string, signal?: AbortSignal): Promise<RemoteEdition> {
  const response = await request(endpoint(bookId, versionId), { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) return failure(response, "Could not load this edition. Retry before making changes.");
  const parsed = editionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new RemoteDraftError("The saved edition could not be read. Your saved layout has not been changed.", 502);
  return parsed.data;
}

function stagedImageFile(side: ArtworkSide, artwork: ProductionArtwork): File {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(artwork.url);
  if (!match || artwork.url.length > 28_000_000) throw new Error("This browser’s artwork could not be read. Choose the image again before saving.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Choose artwork smaller than 20 MB before saving.");
  return new File([bytes], `${side}.${match[1] === "jpeg" ? "jpg" : "png"}`, { type: `image/${match[1]}` });
}

export async function saveRemoteDraft(bookId: string, versionId: string, revision: number, settings: ProductionSettings, artwork: ArtworkMap, signal?: AbortSignal): Promise<SavedEdition> {
  const nextSettings = productionSettingsSchema.parse(settings);
  const nextArtwork: ArtworkMap = {};
  for (const side of ["front", "back"] as const) {
    const key = side === "front" ? "frontPath" : "backPath";
    const path = nextSettings.cover[key];
    if (!path) continue;
    const asset = artwork[side];
    if (!asset || asset.path !== path) throw new Error(`The ${side} artwork is missing. Choose the image again before saving.`);
    if (!path.startsWith("preview/")) { nextArtwork[side] = asset; continue; }
    const body = new FormData(); body.set("side", side); body.set("file", stagedImageFile(side, asset));
    const response = await request(endpoint(bookId, versionId, "/artwork"), { method: "POST", credentials: "same-origin", body, signal });
    if (!response.ok) return failure(response, `Could not upload the ${side} artwork. Your draft is still here.`);
    const parsed = artworkSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.path.startsWith("preview/")) throw new RemoteDraftError("The uploaded artwork could not be verified. Your draft has not been saved.", 502);
    nextArtwork[side] = parsed.data;
    nextSettings.cover[key] = parsed.data.path;
  }
  const response = await request(endpoint(bookId, versionId), {
    method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId, settings: nextSettings, revision }), signal,
  });
  if (!response.ok) return failure(response, "Could not save this edition. Your changes are still here; try again.");
  const confirmation = await response.json().catch(() => null);
  const parsed = editionSchema.safeParse({ ...confirmation, artwork: nextArtwork });
  if (!parsed.success || !parsed.data.settings || parsed.data.revision <= revision) throw new RemoteDraftError("The save could not be confirmed. Reload the saved edition before retrying.", 502);
  return { settings: parsed.data.settings, revision: parsed.data.revision, artwork: parsed.data.artwork };
}

export async function exportRemoteDraft(bookId: string, versionId: string, revision: number, kind: ProductionExportKind, signal?: AbortSignal): Promise<{ blob: Blob; pageCount: number | null; notes: string[] }> {
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Save this edition before generating its PDF.");
  const response = await request(endpoint(bookId, versionId, "/export"), {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId, revision, kind }), signal,
  });
  if (!response.ok) return failure(response, "Could not generate this PDF. Your saved edition has not been changed.");
  const blob = await response.blob();
  if (!response.headers.get("Content-Type")?.includes("application/pdf") || await blob.slice(0, 5).text() !== "%PDF-") throw new RemoteDraftError("The export did not return a valid PDF. Try generating it again.", 502);
  const count = Number(response.headers.get("X-Page-Count"));
  const pageCount = Number.isInteger(count) && count > 0 ? count : null;
  if (kind === "interior" && !pageCount) throw new RemoteDraftError("The PDF page count could not be verified. Generate the interior again.", 502);
  let notes: string[] = [];
  const warnings = response.headers.get("X-Production-Warnings");
  if (warnings) {
    try { notes = z.array(z.string().max(4000)).max(100).parse(JSON.parse(warnings)); }
    catch { try { notes = z.array(z.string().max(4000)).max(100).parse(JSON.parse(decodeURIComponent(warnings))); } catch { notes = ["Export notes could not be read. Review the PDF carefully before printing."]; } }
  }
  return { blob, pageCount, notes };
}

const pendingAccountDrafts = new Map<string, AccountDraft>();
export function pendingAccountDraft(key: string) { return pendingAccountDrafts.get(key); }
export function rememberAccountDraft(key: string, draft: AccountDraft) {
  const dirty = JSON.stringify(draft.settings) !== JSON.stringify(draft.savedSettings);
  if (dirty || draft.recoveryNotice || draft.needsSave) pendingAccountDrafts.set(key, draft);
  else pendingAccountDrafts.delete(key);
  rememberProductionDraft(`account:${key}`, draft);
}

export function resolveAccountDraft(remote: RemoteEdition, pending: AccountDraft | undefined, local: { settings: ProductionSettings; artwork: ArtworkMap } | null, seed: ProductionSettings): { draft: AccountDraft; conflict: boolean; migrating: boolean } {
  if (pending) {
    const artwork = { ...pending.artwork };
    for (const side of ["front", "back"] as const) {
      if (remote.artwork[side]?.path === artwork[side]?.path) artwork[side] = remote.artwork[side];
    }
    return { draft: { ...pending, artwork }, conflict: pending.revision !== remote.revision, migrating: pending.migration ?? false };
  }
  const savedSettings = remote.settings ?? seed;
  const migrating = !remote.settings && Boolean(local);
  return {
    draft: { settings: migrating && local ? local.settings : savedSettings, artwork: migrating && local ? local.artwork : remote.artwork, savedSettings, revision: remote.revision, needsSave: remote.revision === 0, migration: migrating },
    conflict: false, migrating,
  };
}
