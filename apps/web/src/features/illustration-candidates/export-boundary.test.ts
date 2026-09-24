import { expect, it } from "vitest";
import { parsePrintContent } from "@/features/book-production/pdf-content";
import { candidateImageReference } from "./media-reference";

it("refuses private illustrations in print export instead of silently dropping them", () => {
  const scope = { bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222", chapterId: "33333333-3333-4333-8333-333333333333" };
  const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep the image with this text." }] }, { type: "image", attrs: { src: candidateImageReference(scope, "44444444-4444-4444-8444-444444444444"), alt: "Forest" } }] };
  expect(() => parsePrintContent(JSON.stringify(content))).toThrow(/Images.*separate typesetting workflow/);
});
