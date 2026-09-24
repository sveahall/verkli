import { describe, expect, it } from "vitest";
import { candidateImageReference, hasCandidateImage, hasAnyCandidateImage, parseCandidateImage, resolveReaderImages } from "./media-reference";

const scope = { bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222", chapterId: "33333333-3333-4333-8333-333333333333" };
const id = "44444444-4444-4444-8444-444444444444";
const src = `/api/books/${scope.bookId}/editions/${scope.editionId}/chapters/${scope.chapterId}/illustrations/${id}/image`;
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep my draft" }] }, { type: "image", attrs: { src, alt: "A forest", title: null } }] };

describe("private illustration references", () => {
  it("roundtrips only canonical scoped image paths", () => {
    expect(candidateImageReference(scope, id)).toBe(src);
    expect(parseCandidateImage(src)).toEqual({ scope, assetId: id });
    for (const value of [`https://other.test${src}`, `//other.test${src}`, `${src}?x=1`, `${src}/extra`, src.replace(id, "bad"), "javascript:alert(1)"]) expect(parseCandidateImage(value)).toBeNull();
  });
  it("requires an actual image node in the same chapter", () => {
    expect(hasCandidateImage(JSON.stringify(doc), scope, id)).toBe(true);
    expect(hasCandidateImage(doc, { ...scope, editionId: id }, id)).toBe(false);
    expect(hasCandidateImage({ type: "text", text: src }, scope, id)).toBe(false);
    expect(hasCandidateImage({ type: "doc", arbitrary: doc }, scope, id)).toBe(false);
    expect(hasCandidateImage("broken JSON", scope, id)).toBe(false);
  });
  it("recognizes image-only content only in its current scope", () => {
    const imageOnly = { type: "doc", content: [doc.content[1]] };
    expect(hasAnyCandidateImage(JSON.stringify(imageOnly), scope)).toBe(true);
    expect(hasAnyCandidateImage(doc, scope)).toBe(true);
    expect(hasAnyCandidateImage(imageOnly, { ...scope, chapterId: id })).toBe(false);
    expect(hasAnyCandidateImage({ type: "image", attrs: { src: "https://other.test/image" } }, scope)).toBe(false);
    expect(hasAnyCandidateImage("", scope)).toBe(false);
  });
  it("rewrites the reader image without changing prose, alt or source document", () => {
    const result = resolveReaderImages(doc);
    expect(result).toEqual({ ...doc, content: [doc.content[0], { type: "image", attrs: { src: src.replace('/api/books/', '/api/reader/books/'), alt: "A forest", title: null } }] });
    expect(doc.content[1].attrs?.src).toBe(src);
    const unrelated = { type: "image", attrs: { src: "https://cdn.example/image.png", alt: "Existing image" } };
    expect(resolveReaderImages(unrelated)).toEqual(unrelated);
  });
  it("fails closed on excessive nesting and node counts", () => {
    let nested: unknown = doc;
    for (let i = 0; i < 65; i++) nested = { type: "doc", content: [nested] };
    expect(hasCandidateImage(nested, scope, id)).toBe(false);
    expect(() => resolveReaderImages(nested)).toThrow(/read limit/);
    expect(hasCandidateImage({ type: "doc", content: Array.from({ length: 30001 }, () => ({ type: "paragraph" })) }, scope, id)).toBe(false);
  });
});
