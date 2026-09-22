import { describe, expect, it, vi } from "vitest";
import {
  CHAPTER_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  uploadImportedChapterImages,
  type ImportImageStorage,
} from "@/lib/import-images";
import type { TiptapDocument } from "@/lib/tiptap-content";

function dataUri(bytes: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function imageDoc(...srcs: string[]): TiptapDocument {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Brödtext." }] },
      ...srcs.map((src) => ({
        type: "image" as const,
        attrs: { src, alt: null, title: null },
      })),
    ],
  };
}

function srcsOf(doc: TiptapDocument | undefined): string[] {
  return (doc?.content ?? [])
    .filter((block) => block.type === "image")
    .map((block) => (block.type === "image" ? block.attrs.src : ""));
}

function fakeStorage(overrides?: { uploadError?: { message: string } }) {
  // The parameters have to be declared, not inferred: with a bare
  // `async () => ...` vitest types `upload.mock.calls[0]` as an empty tuple and
  // every `calls[0][0]` assertion below fails to compile. Recording them here
  // keeps them genuinely used and gives the byte assertions something to read.
  const writes: Array<{ path: string; bytes: number; contentType?: string }> = [];
  const upload = vi.fn(
    async (
      path: string,
      body: Buffer | Uint8Array,
      options?: { contentType?: string; cacheControl?: string; upsert?: boolean }
    ) => {
      writes.push({ path, bytes: body.byteLength, contentType: options?.contentType });
      return { error: overrides?.uploadError ?? null };
    }
  );
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.test/${CHAPTER_MEDIA_BUCKET}/${path}` },
  }));
  const storage: ImportImageStorage = { from: vi.fn(() => ({ upload, getPublicUrl })) };
  return { storage, upload, getPublicUrl, writes };
}

const BASE = { bookId: "book-1", importId: "imp-1" };

describe("uploadImportedChapterImages", () => {
  it("uploads an inline picture and rewrites the src to the public URL", async () => {
    const { storage, upload } = fakeStorage();
    const uri = dataUri(Buffer.from("fake-png-bytes"));

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(uri)],
      storage,
    });

    expect(result.uploaded).toBe(1);
    expect(result.dropped).toBe(0);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(srcsOf(result.documents[0])[0]).toMatch(/^https:\/\/cdn\.test\//);
    // The bytes must not survive anywhere in the stored document.
    expect(JSON.stringify(result.documents[0])).not.toContain("base64");
  });

  it("serves the object under the mime it was declared with, not the bytes", async () => {
    const { storage, upload } = fakeStorage();

    await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(dataUri(Buffer.from("x"), "image/jpeg"))],
      storage,
    });

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^book-1\/import-imp-1\/[0-9a-f]{32}\.jpg$/),
      expect.anything(),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true })
    );
  });

  it("uploads a repeated picture once and points both nodes at it", async () => {
    const { storage, upload } = fakeStorage();
    const uri = dataUri(Buffer.from("same-logo"));

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(uri), imageDoc(uri)],
      storage,
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.uploaded).toBe(1);
    expect(srcsOf(result.documents[0])[0]).toBe(srcsOf(result.documents[1])[0]);
  });

  it("counts every picture, so the tallies add up to what the manuscript held", async () => {
    const { storage } = fakeStorage();
    const repeated = dataUri(Buffer.from("logo"));
    const unique = dataUri(Buffer.from("figure"));
    const broken = "data:image/svg+xml;base64,PHN2Zz4=";

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(repeated, unique), imageDoc(repeated, broken), imageDoc(broken)],
      storage,
    });

    // Five image nodes went in: two of them the same logo, one figure, and the
    // same rejected svg twice. Every one is accounted for exactly once.
    expect(result.uploaded + result.reused + result.dropped).toBe(5);
    expect(result).toMatchObject({ uploaded: 2, reused: 1, dropped: 2 });
  });

  it("gives identical bytes the same path across chapters, so a retry overwrites", async () => {
    const { storage, upload } = fakeStorage();
    const bytes = Buffer.from("stable");

    await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(dataUri(bytes))],
      storage,
    });
    const firstPath = upload.mock.calls[0][0];

    const second = fakeStorage();
    await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(dataUri(bytes))],
      storage: second.storage,
    });

    expect(second.upload.mock.calls[0][0]).toBe(firstPath);
  });

  it("drops the node when the upload fails, keeping the rest of the chapter", async () => {
    const { storage } = fakeStorage({ uploadError: { message: "bucket is full" } });

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(dataUri(Buffer.from("bytes")))],
      storage,
    });

    expect(result.dropped).toBe(1);
    expect(result.warnings).toContain("image_upload_failed");
    expect(srcsOf(result.documents[0])).toHaveLength(0);
    // The prose is untouched — one lost picture must not cost the text.
    expect(result.documents[0]?.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Brödtext." }],
    });
  });

  it("drops a picture over the per-image ceiling instead of uploading it", async () => {
    const { storage, upload } = fakeStorage();
    const huge = dataUri(Buffer.alloc(MAX_IMAGE_BYTES + 1, 7));

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc(huge)],
      storage,
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result.dropped).toBe(1);
    expect(result.warnings).toContain("image_too_large");
  });

  it("drops a data URI whose type is not an allowed image", async () => {
    const { storage, upload } = fakeStorage();
    const doc = imageDoc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");

    const result = await uploadImportedChapterImages({ ...BASE, documents: [doc], storage });

    expect(upload).not.toHaveBeenCalled();
    expect(result.dropped).toBe(1);
    expect(result.warnings).toContain("image_unsupported_type");
  });

  it("leaves an already-remote src alone and never touches storage", async () => {
    const { storage, upload } = fakeStorage();

    const result = await uploadImportedChapterImages({
      ...BASE,
      documents: [imageDoc("https://cdn.example.com/cover.png")],
      storage,
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result.uploaded).toBe(0);
    expect(srcsOf(result.documents[0])[0]).toBe("https://cdn.example.com/cover.png");
  });

  it("returns documents untouched, and calls nothing, when there are no pictures", async () => {
    const { storage } = fakeStorage();
    const docs: (TiptapDocument | undefined)[] = [imageDoc(), undefined];

    const result = await uploadImportedChapterImages({ ...BASE, documents: docs, storage });

    expect(result.documents).toBe(docs);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("rewrites pictures nested in a blockquote", async () => {
    const { storage } = fakeStorage();
    const uri = dataUri(Buffer.from("nested"));
    const doc: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "image", attrs: { src: uri, alt: null, title: null } }],
        },
      ],
    };

    const result = await uploadImportedChapterImages({ ...BASE, documents: [doc], storage });

    const quote = result.documents[0]?.content[0];
    expect(quote?.type).toBe("blockquote");
    expect(JSON.stringify(quote)).toMatch(/https:\/\/cdn\.test\//);
    expect(JSON.stringify(quote)).not.toContain("base64");
  });

  it("keeps the document order and length so chapter rows stay aligned", async () => {
    const { storage } = fakeStorage();
    const docs: (TiptapDocument | undefined)[] = [
      imageDoc(dataUri(Buffer.from("a"))),
      undefined,
      imageDoc(dataUri(Buffer.from("b"))),
    ];

    const result = await uploadImportedChapterImages({ ...BASE, documents: docs, storage });

    expect(result.documents).toHaveLength(3);
    expect(result.documents[1]).toBeUndefined();
    expect(srcsOf(result.documents[0])[0]).not.toBe(srcsOf(result.documents[2])[0]);
  });
});
