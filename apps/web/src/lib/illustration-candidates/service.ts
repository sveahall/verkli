import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { candidateBaseUrl, intentSchema, scopeKeySchema, type CandidateIntent, type CandidateScopeKey, type CandidateSnapshot, type SavedCandidate } from "@/features/illustration-candidates/contracts";
export type Scope = CandidateScopeKey & { ownerId: string; chapterVersion: number; chapterTitle: string };
export type AssetRow = { id: string; book_id: string; user_id: string; content_type: string; channel: string; version: number; status: string; visibility: string; config: unknown; metadata: unknown; created_at: string };
export type CandidatePorts = {
  authorize(ownerId: string, key: CandidateScopeKey): Promise<Scope | null>;
  ready(): Promise<boolean>;
  find(scope: Scope, id: string): Promise<AssetRow | null>;
  list(scope: Scope): Promise<AssetRow[]>;
  nextVersion(scope: Scope): Promise<number>;
  reserve(row: Omit<AssetRow, "created_at">): Promise<AssetRow | null>;
  complete(scope: Scope, id: string, intentHash: string): Promise<AssetRow | null>;
  upload(path: string, bytes: Buffer, mime: string): Promise<void>;
  download(path: string): Promise<Buffer | null>;
};
export class CandidateError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const unavailable = () => new CandidateError(503, "UNAVAILABLE", "Private image storage is unavailable. Keep your proposal and retry.");
const missing = () => new CandidateError(404, "NOT_FOUND", "This chapter or image candidate is unavailable.");
const conflict = () => new CandidateError(409, "CONFLICT", "The chapter or request changed. Reload the candidates and review your proposal.");
const configSchema = z.object({
  feature: z.literal("chapter_illustration"), contractVersion: z.literal(1),
  editionId: z.string().uuid(), chapterId: z.string().uuid(),
  sourceChapterVersion: intentSchema.shape.expectedChapterVersion,
  alt: intentSchema.shape.alt, placement: intentSchema.shape.placement, styleSnapshot: intentSchema.shape.styleSnapshot,
}).strict();
const metadataSchema = z.object({
  source: z.literal("manual_upload"), bucket: z.literal("content-assets"), path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), intentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(["image/png", "image/jpeg"]), width: z.number().int().min(1).max(20_000), height: z.number().int().min(1).max(20_000),
}).strict();
type Metadata = z.infer<typeof metadataSchema>;
function pathFor(scope: Scope, id: string, sha256: string, mime: string) {
  return `${scope.ownerId}/${scope.bookId}/illustrations/${scope.chapterId}/${id}-${sha256}.${mime === "image/png" ? "png" : "jpg"}`;
}
function intentHash(scope: Scope, intent: CandidateIntent, sha256: string) {
  return hash(JSON.stringify([scope.ownerId, scope.bookId, scope.editionId, scope.chapterId, intent.requestId, intent.expectedChapterVersion, intent.alt, intent.placement, intent.styleSnapshot.name, intent.styleSnapshot.medium, intent.styleSnapshot.palette, sha256]));
}
async function decode(bytes: Buffer, mime: string) {
  try {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !["image/png", "image/jpeg"].includes(mime)) throw new Error();
    // libvips can decode only the default APNG frame and report pages=1.
    // Inspect actual PNG chunks, not an arbitrary substring in compressed pixels.
    if (mime === "image/png") {
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") throw new Error();
        if (length > bytes.length - offset - 12) throw new Error();
        offset += length + 12;
      }
    }
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (`image/${meta.format}` !== mime || !meta.width || !meta.height || meta.width > 20_000 || meta.height > 20_000 || (meta.pages ?? 1) !== 1) throw new Error();
    // metadata() alone does not decode the image or reject truncated pixel data.
    await image.stats();
    return { width: meta.width, height: meta.height, sha256: hash(bytes) };
  } catch {
    throw new CandidateError(400, "INVALID_IMAGE", "Choose a complete, still PNG or JPEG up to 10 MB, 40 megapixels and 20,000 pixels per side.");
  }
}

export class CandidateService {
  constructor(private ports: CandidatePorts, private ownerId: string, private key: CandidateScopeKey) {}
  private async scope() {
    if (!scopeKeySchema.safeParse(this.key).success || !z.string().uuid().safeParse(this.ownerId).success) throw missing();
    const scope = await this.ports.authorize(this.ownerId, this.key);
    if (!scope || scope.ownerId !== this.ownerId || scope.bookId !== this.key.bookId || scope.editionId !== this.key.editionId || scope.chapterId !== this.key.chapterId) throw missing();
    return scope;
  }
  private async ready() { if (!await this.ports.ready()) throw unavailable(); }
  private checked(scope: Scope, row: AssetRow | null) {
    if (!row || !z.string().uuid().safeParse(row.id).success || row.user_id !== scope.ownerId || row.book_id !== scope.bookId || row.content_type !== "image" || row.channel !== "generic" || row.visibility !== "private" || !["pending", "completed"].includes(row.status) || !Number.isSafeInteger(row.version) || row.version < 1 || !z.string().datetime({ offset: true }).safeParse(row.created_at).success) throw missing();
    const config = configSchema.safeParse(row.config); const metadata = metadataSchema.safeParse(row.metadata);
    if (!config.success || !metadata.success || config.data.editionId !== scope.editionId || config.data.chapterId !== scope.chapterId) throw missing();
    const c = config.data; const m = metadata.data;
    const intent = { requestId: row.id, expectedChapterVersion: c.sourceChapterVersion, alt: c.alt, placement: c.placement, styleSnapshot: c.styleSnapshot };
    if (m.width * m.height > 40_000_000 || m.path !== pathFor(scope, row.id, m.sha256, m.mime) || m.intentHash !== intentHash(scope, intent, m.sha256)) throw missing();
    return { row, config: c, metadata: m };
  }
  private dto(value: ReturnType<CandidateService["checked"]>): SavedCandidate {
    const { row, config, metadata } = value;
    return { id: row.id, version: row.version, createdAt: row.created_at, alt: config.alt, placement: config.placement, styleSnapshot: config.styleSnapshot, width: metadata.width, height: metadata.height, sourceChapterVersion: config.sourceChapterVersion, imageUrl: `${candidateBaseUrl(this.key)}/${row.id}/image` };
  }
  private async bytes(scope: Scope, id: string, metadata: Metadata) {
    // Derive this path again. Client-writable metadata is never a storage locator.
    const bytes = await this.ports.download(pathFor(scope, id, metadata.sha256, metadata.mime));
    if (!bytes || hash(bytes) !== metadata.sha256) throw unavailable();
    try {
      const image = await decode(bytes, metadata.mime);
      if (image.width !== metadata.width || image.height !== metadata.height) throw unavailable();
    } catch { throw unavailable(); }
    return bytes;
  }
  async list(): Promise<CandidateSnapshot> {
    const scope = await this.scope(); await this.ready();
    const candidates: SavedCandidate[] = [];
    for (const row of (await this.ports.list(scope)).slice(0, 25)) {
      try { const checked = this.checked(scope, row); if (row.status === "completed") candidates.push(this.dto(checked)); }
      catch (error) { if (!(error instanceof CandidateError) || error.status !== 404) throw error; }
    }
    const current = await this.scope();
    return { scope: { ...this.key, chapterVersion: current.chapterVersion, chapterTitle: current.chapterTitle }, candidates };
  }
  async save(input: CandidateIntent, file: File): Promise<SavedCandidate> {
    const parsed = intentSchema.safeParse(input);
    if (!parsed.success) throw new CandidateError(400, "INVALID_INTENT", "Provide alternative text, placement and a complete style description.");
    const intent = parsed.data;
    const scope = await this.scope(); await this.ready();
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw new CandidateError(400, "INVALID_IMAGE", "Choose a PNG or JPEG up to 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer()); const image = await decode(bytes, file.type);
    const token = intentHash(scope, intent, image.sha256);
    let row = await this.ports.find(scope, intent.requestId);
    if (row) {
      const checked = this.checked(scope, row);
      if (checked.metadata.intentHash !== token) throw conflict();
      // Reconcile a completed request even if the source chapter has since changed.
      if (row.status === "completed") {
        await this.bytes(scope, row.id, checked.metadata); await this.scope();
        return this.dto(checked);
      }
    }
    if (scope.chapterVersion !== intent.expectedChapterVersion) throw conflict();
    const config = { feature: "chapter_illustration", contractVersion: 1, editionId: scope.editionId, chapterId: scope.chapterId, sourceChapterVersion: scope.chapterVersion, alt: intent.alt, placement: intent.placement, styleSnapshot: intent.styleSnapshot };
    const metadata = { source: "manual_upload", bucket: "content-assets", path: pathFor(scope, intent.requestId, image.sha256, file.type), ...image, mime: file.type, intentHash: token };
    for (let attempt = 0; !row && attempt < 3; attempt += 1) {
      const version = await this.ports.nextVersion(scope);
      if (!Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647) throw conflict();
      row = await this.ports.reserve({ id: intent.requestId, user_id: scope.ownerId, book_id: scope.bookId, content_type: "image", channel: "generic", version, visibility: "private", status: "pending", config, metadata });
      if (!row) row = await this.ports.find(scope, intent.requestId);
    }
    if (!row) throw conflict();
    let checked = this.checked(scope, row);
    if (checked.metadata.intentHash !== token) throw conflict();
    if (row.status !== "completed") {
      try { await this.ports.upload(pathFor(scope, row.id, image.sha256, file.type), bytes, file.type); }
      catch { /* A previous attempt may have uploaded successfully. Verify, never overwrite. */ }
    }
    await this.bytes(scope, row.id, checked.metadata);
    const current = await this.scope();
    if (current.chapterVersion !== intent.expectedChapterVersion) throw conflict();
    if (row.status !== "completed") await this.ports.complete(scope, row.id, token);
    checked = this.checked(scope, await this.ports.find(scope, row.id));
    if (checked.row.status !== "completed" || checked.metadata.intentHash !== token) throw unavailable();
    await this.bytes(scope, row.id, checked.metadata); await this.scope();
    return this.dto(checked);
  }
  async image(id: string): Promise<{ bytes: Buffer; mime: string }> {
    if (!z.string().uuid().safeParse(id).success) throw missing();
    const scope = await this.scope(); await this.ready();
    const checked = this.checked(scope, await this.ports.find(scope, id));
    if (checked.row.status !== "completed") throw missing();
    const bytes = await this.bytes(scope, id, checked.metadata); await this.scope();
    return { bytes, mime: checked.metadata.mime };
  }
}
