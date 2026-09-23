import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { getBookAsOwner } from "@/lib/books/service";
import { isValidUuid } from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { MAX_PRODUCTION_SETTINGS_BYTES, productionSettingsSchema, type ProductionSettings } from "@/features/book-production/model";
import type { ArtworkMap, ArtworkSide, ProductionArtwork } from "@/features/book-production/ProductionCover";

export const PRINT_ARTWORK_BUCKET = "print-artwork";
export const MAX_PRINT_ARTWORK_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 50_000_000;
const ARTWORK_URL_TTL_SECONDS = 15 * 60;
const DRAFT_COLUMNS = "book_id, version_id, owner_id, settings, revision";
const JSON_BODY_BYTES = MAX_PRODUCTION_SETTINGS_BYTES + 16 * 1024;

type DraftRow = Database["public"]["Tables"]["book_production_drafts"]["Row"];

export type ProductionContext = {
  supabase: SupabaseClient<Database>;
  ownerId: string;
  bookId: string;
  versionId: string;
  book: { id: string; author_id: string; title: string; deleted_at?: string | null };
  version: { id: string; book_id: string; language_code: string };
};

export class ProductionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ProductionError";
  }
}

export function productionErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProductionError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  }
  console.error("[book production] unexpected request failure", { message: error instanceof Error ? error.message : "Unknown error" });
  return NextResponse.json({ error: "PRODUCTION_REQUEST_FAILED", message: "Book production could not complete this request. Your changes are still in this tab. Try again." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
}

function databaseFailure(action: string, error: { code?: string; message?: string }): never {
  console.error(`[book production] ${action} failed`, { code: error.code, message: error.message });
  if (["42P01", "PGRST205"].includes(error.code ?? "")) {
    throw new ProductionError(503, "PRODUCTION_STORAGE_NOT_READY", "Saving book layouts is temporarily unavailable. Keep this tab open and try again shortly.");
  }
  throw new ProductionError(500, "PRODUCTION_DATABASE_FAILED", "Could not access this edition’s production draft. Try again.");
}

export async function authorizeProductionEdition(bookId: string, versionId: string): Promise<ProductionContext> {
  if (!isValidUuid(bookId) || !isValidUuid(versionId)) {
    throw new ProductionError(400, "PRODUCTION_INVALID_EDITION", "Choose a valid book edition before preparing its print layout.");
  }
  const { user, response } = await requireAuthorRoleForApi();
  if (response || !user) {
    const status = response?.status ?? 401;
    throw new ProductionError(status, "PRODUCTION_AUTH_REQUIRED", status === 401 ? "Sign in to open your book layout." : "Author access is required to edit book layouts.");
  }
  const client = await createClient();
  const owned = await getBookAsOwner<ProductionContext["book"]>(client, bookId, user.id, "id, author_id, title, deleted_at");
  if (!owned.ok) {
    if (owned.error === "database_error") throw new ProductionError(500, "PRODUCTION_DATABASE_FAILED", "Could not verify this book. Try again.");
    throw new ProductionError(404, "PRODUCTION_BOOK_NOT_FOUND", "This book is not available in your account.");
  }
  if (owned.data.deleted_at) throw new ProductionError(404, "PRODUCTION_BOOK_NOT_FOUND", "This book is not available in your account.");
  const { data: version, error } = await client.from("book_versions")
    .select("id, book_id, language_code").eq("id", versionId).eq("book_id", owned.data.id).maybeSingle();
  if (error) databaseFailure("edition lookup", error);
  if (!version || version.book_id !== owned.data.id) throw new ProductionError(404, "PRODUCTION_EDITION_NOT_FOUND", "This edition is not available in this book.");
  return { supabase: client, ownerId: user.id, bookId: owned.data.id, versionId: version.id, book: owned.data, version };
}

export async function readProductionBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ProductionError(413, "PRODUCTION_BODY_TOO_LARGE", "This upload or layout is too large. Reduce its size and try again.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ProductionError(413, "PRODUCTION_BODY_TOO_LARGE", "This upload or layout is too large. Reduce its size and try again.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readProductionJson(request: Request, maxBytes = JSON_BODY_BYTES): Promise<unknown> {
  const body = await readProductionBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new ProductionError(400, "PRODUCTION_INVALID_JSON", "Send a valid book production layout before saving."); }
}

export function assertProductionArtworkPath(context: ProductionContext, path: string, side: ArtworkSide): void {
  const prefix = `${context.ownerId}/${context.bookId}/${context.versionId}/${side}-`;
  const filename = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/.test(filename)) {
    throw new ProductionError(400, "PRODUCTION_ARTWORK_SCOPE_INVALID", "Upload this cover artwork to the current book edition before saving or exporting.");
  }
}

function parseStoredDraft(context: ProductionContext, row: Pick<DraftRow, "book_id" | "version_id" | "owner_id" | "settings" | "revision">) {
  const settings = productionSettingsSchema.safeParse(row.settings);
  if (!settings.success || !Number.isInteger(row.revision) || row.revision < 1 || row.owner_id !== context.ownerId || row.book_id !== context.bookId || row.version_id !== context.versionId) {
    console.error("[book production] stored draft failed validation", { bookId: context.bookId, versionId: context.versionId });
    throw new ProductionError(500, "PRODUCTION_DRAFT_INVALID", "The saved layout could not be read. Keep this tab open and contact support before replacing it.");
  }
  for (const side of ["front", "back"] as const) {
    const path = settings.data.cover[side === "front" ? "frontPath" : "backPath"];
    if (path) assertProductionArtworkPath(context, path, side);
  }
  return { settings: settings.data, revision: row.revision };
}

export async function loadProductionDraft(context: ProductionContext): Promise<{ settings: ProductionSettings | null; revision: number }> {
  const { data, error } = await context.supabase.from("book_production_drafts").select(DRAFT_COLUMNS)
    .eq("book_id", context.bookId).eq("version_id", context.versionId).eq("owner_id", context.ownerId).maybeSingle();
  if (error) databaseFailure("draft load", error);
  return data ? parseStoredDraft(context, data) : { settings: null, revision: 0 };
}

export async function saveProductionDraft(context: ProductionContext, settings: ProductionSettings, revision: number) {
  for (const side of ["front", "back"] as const) {
    const path = settings.cover[side === "front" ? "frontPath" : "backPath"];
    if (path) await loadProductionArtwork(context, path, side);
  }
  const table = context.supabase.from("book_production_drafts");
  const result = revision === 0
    ? await table.insert({ book_id: context.bookId, version_id: context.versionId, owner_id: context.ownerId, settings: settings as unknown as Json, revision: 1 }).select(DRAFT_COLUMNS).maybeSingle()
    : await table.update({ settings: settings as unknown as Json, revision: revision + 1 })
      .eq("book_id", context.bookId).eq("version_id", context.versionId).eq("owner_id", context.ownerId).eq("revision", revision).select(DRAFT_COLUMNS).maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data)) {
    throw new ProductionError(409, "PRODUCTION_REVISION_CONFLICT", "This edition’s layout was saved in another tab or device. Reload the saved layout before saving your changes again.");
  }
  if (result.error) databaseFailure("draft save", result.error);
  return parseStoredDraft(context, result.data!);
}

export type DecodedProductionArtwork = {
  buffer: Buffer;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  format: "jpeg" | "png";
};

async function decodeArtwork(buffer: Buffer, expectedMime?: string): Promise<DecodedProductionArtwork> {
  if (buffer.byteLength > MAX_PRINT_ARTWORK_BYTES) throw new ProductionError(413, "PRODUCTION_ARTWORK_TOO_LARGE", "Choose a JPG or PNG image no larger than 20 MB.");
  try {
    const decoder = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 20_000 || metadata.height > 20_000 || metadata.width * metadata.height > MAX_IMAGE_PIXELS || (metadata.pages ?? 1) > 1 || !["jpeg", "png"].includes(metadata.format ?? "")) {
      throw new Error("Unsupported image format or dimensions");
    }
    const format = metadata.format as "jpeg" | "png";
    if (expectedMime && expectedMime !== `image/${format}`) throw new Error("Image MIME type does not match its contents");
    // Validate every pixel, including on direct Supabase uploads, while keeping
    // the original bytes and raw dimensions for the PDF engine's own rotation.
    await decoder.stats();
    const swapped = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
    return {
      buffer, width: metadata.width, height: metadata.height, format,
      displayWidth: swapped ? metadata.height : metadata.width,
      displayHeight: swapped ? metadata.width : metadata.height,
    };
  } catch (error) {
    if (error instanceof ProductionError) throw error;
    throw new ProductionError(400, "PRODUCTION_ARTWORK_INVALID", "Choose a valid, still JPG or PNG below 50 megapixels and 20,000 pixels per side.");
  }
}

export async function loadProductionArtwork(context: ProductionContext, path: string, side: ArtworkSide): Promise<DecodedProductionArtwork> {
  assertProductionArtworkPath(context, path, side);
  const { data, error } = await context.supabase.storage.from(PRINT_ARTWORK_BUCKET).download(path);
  if (error || !data) {
    console.error("[book production] artwork download failed", { bookId: context.bookId, versionId: context.versionId, message: error?.message });
    throw new ProductionError(400, "PRODUCTION_ARTWORK_UNAVAILABLE", "This edition’s cover artwork could not be loaded. Upload the image again before saving or exporting.");
  }
  if (data.size > MAX_PRINT_ARTWORK_BYTES) throw new ProductionError(413, "PRODUCTION_ARTWORK_TOO_LARGE", "Choose cover artwork no larger than 20 MB.");
  return decodeArtwork(Buffer.from(await data.arrayBuffer()));
}

async function signedArtwork(context: ProductionContext, path: string, width: number, height: number): Promise<ProductionArtwork> {
  const { data, error } = await context.supabase.storage.from(PRINT_ARTWORK_BUCKET).createSignedUrl(path, ARTWORK_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[book production] artwork signing failed", { bookId: context.bookId, versionId: context.versionId, message: error?.message });
    throw new ProductionError(500, "PRODUCTION_ARTWORK_SIGN_FAILED", "The artwork preview could not be opened. Your upload may have completed; try again.");
  }
  return { path, url: data.signedUrl, width, height };
}

export async function loadProductionArtworkMap(context: ProductionContext, settings: ProductionSettings | null): Promise<ArtworkMap> {
  const artwork: ArtworkMap = {};
  if (!settings) return artwork;
  for (const side of ["front", "back"] as const) {
    const path = settings.cover[side === "front" ? "frontPath" : "backPath"];
    if (!path) continue;
    const image = await loadProductionArtwork(context, path, side);
    artwork[side] = await signedArtwork(context, path, image.displayWidth, image.displayHeight);
  }
  return artwork;
}

export async function uploadProductionArtwork(context: ProductionContext, file: File, side: ArtworkSide): Promise<ProductionArtwork> {
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new ProductionError(400, "PRODUCTION_ARTWORK_INVALID", "Choose a JPG or PNG image for your print cover.");
  if (file.size > MAX_PRINT_ARTWORK_BYTES) throw new ProductionError(413, "PRODUCTION_ARTWORK_TOO_LARGE", "Choose a JPG or PNG image no larger than 20 MB.");
  const original = Buffer.from(await file.arrayBuffer());
  const image = await decodeArtwork(original, file.type);
  const path = `${context.ownerId}/${context.bookId}/${context.versionId}/${side}-${crypto.randomUUID()}.${image.format === "jpeg" ? "jpg" : "png"}`;
  const { error } = await context.supabase.storage.from(PRINT_ARTWORK_BUCKET).upload(path, original, { contentType: `image/${image.format}`, cacheControl: "3600", upsert: false });
  if (error) {
    console.error("[book production] artwork upload failed", { bookId: context.bookId, versionId: context.versionId, message: error.message });
    throw new ProductionError(500, "PRODUCTION_ARTWORK_UPLOAD_FAILED", "Could not save this print artwork. Your layout is still open; try the upload again.");
  }
  return signedArtwork(context, path, image.displayWidth, image.displayHeight);
}

export const productionSaveSchema = z.object({
  versionId: z.string().uuid(),
  settings: productionSettingsSchema,
  revision: z.number().int().min(0).max(2_147_483_646),
}).strict();
