/**
 * Move the pictures out of an imported manuscript and into storage.
 *
 * mammoth returns every image embedded in a .docx as a `data:` URI, so the
 * document htmlToTiptapDoc builds carries the full bytes inline. Writing that
 * straight into `chapters.content` is the exact failure the editor's own
 * paste-image path was changed to avoid: a single 2 MB photo becomes ~2.7 MB
 * of base64 in a text column that is then re-read and re-written on every
 * autosave. So the import pipeline uploads the bytes once and stores a URL.
 *
 * Content-addressed by sha256, which buys two things for free: a logo repeated
 * on forty chapter openers uploads once, and re-running an import writes to the
 * same object instead of littering the bucket with copies.
 */
import { createHash } from "node:crypto";

import type {
  TiptapBlockNode,
  TiptapDocument,
  TiptapListItemNode,
} from "./tiptap-content";

/** Public bucket the editor already uses for images pasted into a chapter. */
export const CHAPTER_MEDIA_BUCKET = "chapter-media";

/** A single picture larger than this is dropped rather than uploaded. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Total image payload accepted from one import. */
export const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;

/** Upper bound on distinct images, so a pathological file cannot stall a worker. */
export const MAX_IMAGES_PER_IMPORT = 250;

/**
 * The content type is taken from this table, never from the uploaded bytes.
 * The bucket is public, so what matters is that the object is *served* as an
 * image: a file that lies about being a PNG is then inert, because the browser
 * never gets a chance to treat it as a document.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const DATA_URI = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/;

type StorageBucket = {
  upload(
    path: string,
    body: Buffer | Uint8Array,
    options?: { contentType?: string; cacheControl?: string; upsert?: boolean }
  ): Promise<{ error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
};

/** The slice of a Supabase storage client this module needs. Kept narrow so
 *  tests can hand in a fake without standing up a client. */
export type ImportImageStorage = {
  from(bucket: string): StorageBucket;
};

export type UploadImportedImagesResult = {
  /** Same length and order as the input; images that could not be stored are gone. */
  documents: (TiptapDocument | undefined)[];
  uploaded: number;
  /** Images that resolved to an object an earlier one in this run already wrote. */
  reused: number;
  dropped: number;
  warnings: string[];
};

function collectDataUris(blocks: TiptapBlockNode[], out: string[]): void {
  for (const block of blocks) {
    if (block.type === "image") {
      if (DATA_URI.test(block.attrs.src)) out.push(block.attrs.src);
      continue;
    }
    if (block.type === "blockquote") {
      collectDataUris(block.content, out);
      continue;
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const item of block.content) collectDataUris(item.content, out);
    }
  }
}

function rewriteBlocks(
  blocks: TiptapBlockNode[],
  resolve: (src: string) => string | null
): TiptapBlockNode[] {
  const out: TiptapBlockNode[] = [];

  for (const block of blocks) {
    if (block.type === "image") {
      const src = resolve(block.attrs.src);
      // null means "this one could not be stored" — drop the node rather than
      // persist a data: URI, which is the bloat this module exists to prevent.
      if (src) out.push({ ...block, attrs: { ...block.attrs, src } });
      continue;
    }

    if (block.type === "blockquote") {
      out.push({ ...block, content: rewriteBlocks(block.content, resolve) });
      continue;
    }

    if (block.type === "bulletList" || block.type === "orderedList") {
      const items: TiptapListItemNode[] = block.content.map((item) => ({
        ...item,
        content: rewriteBlocks(item.content, resolve),
      }));
      out.push({ ...block, content: items });
      continue;
    }

    out.push(block);
  }

  return out;
}

/**
 * Upload every `data:` image in these documents and return them with the srcs
 * rewritten to public URLs. Documents without images come back untouched.
 *
 * Never throws: a storage failure drops that one picture and records a warning,
 * because losing an illustration must not fail an otherwise good import of a
 * whole manuscript.
 */
export async function uploadImportedChapterImages(params: {
  documents: (TiptapDocument | undefined)[];
  bookId: string;
  importId: string;
  storage: ImportImageStorage;
}): Promise<UploadImportedImagesResult> {
  const { documents, bookId, importId, storage } = params;

  const dataUris: string[] = [];
  for (const doc of documents) {
    if (doc) collectDataUris(doc.content, dataUris);
  }

  if (dataUris.length === 0) {
    return { documents, uploaded: 0, reused: 0, dropped: 0, warnings: [] };
  }

  const bucket = storage.from(CHAPTER_MEDIA_BUCKET);
  const resolved = new Map<string, string | null>();
  const urlByHash = new Map<string, string>();
  const warnings: string[] = [];
  let uploaded = 0;
  let reused = 0;
  let dropped = 0;
  let totalBytes = 0;

  // dataUris carries one entry per image node, repeats included, so that
  // uploaded + reused + dropped always equals the number of pictures the
  // manuscript actually contained. Silent image loss is the bug this module
  // was written for; counters that don't add up would hide the next one.
  for (const uri of dataUris) {
    if (resolved.has(uri)) {
      if (resolved.get(uri)) reused++;
      else dropped++;
      continue;
    }

    const match = DATA_URI.exec(uri);
    const extension = match ? EXTENSION_BY_MIME[match[1].toLowerCase()] : undefined;
    if (!match || !extension) {
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_unsupported_type");
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(match[2], "base64");
    } catch {
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_decode_failed");
      continue;
    }

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_too_large");
      continue;
    }

    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const cached = urlByHash.get(hash);
    if (cached) {
      resolved.set(uri, cached);
      reused++;
      continue;
    }

    if (urlByHash.size >= MAX_IMAGES_PER_IMPORT) {
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_count_exceeded");
      continue;
    }

    if (totalBytes + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) {
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_budget_exceeded");
      continue;
    }

    const path = `${bookId}/import-${importId}/${hash}.${extension}`;
    const { error } = await bucket.upload(path, bytes, {
      contentType: match[1].toLowerCase(),
      cacheControl: "31536000",
      // A retried import re-derives the same content-addressed path, and
      // rewriting identical bytes is cheaper than reasoning about conflicts.
      upsert: true,
    });

    if (error) {
      console.error("[import images] upload failed", {
        importId,
        path,
        message: error.message,
      });
      resolved.set(uri, null);
      dropped++;
      warnings.push("image_upload_failed");
      continue;
    }

    const url = bucket.getPublicUrl(path).data.publicUrl;
    urlByHash.set(hash, url);
    resolved.set(uri, url);
    totalBytes += bytes.byteLength;
    uploaded++;
  }

  const resolveSrc = (src: string): string | null =>
    resolved.has(src) ? resolved.get(src) ?? null : src;

  return {
    documents: documents.map((doc) =>
      doc ? { ...doc, content: rewriteBlocks(doc.content, resolveSrc) } : doc
    ),
    uploaded,
    reused,
    dropped,
    // One warning per distinct cause is enough for the import record; the
    // console lines above carry the per-file detail.
    warnings: [...new Set(warnings)],
  };
}
