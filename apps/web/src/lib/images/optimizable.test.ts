/**
 * Pins the rule that decides whether a cover is downloaded at full size.
 *
 * Getting this backwards is expensive and silent: `unoptimized` on a remote URL
 * hands the original to the browser, so `sizes="28px"` on a 26 MB PNG cover
 * fetches 26 MB from Supabase Storage. That is how the project passed 147% of a
 * 5 GB egress quota with 7 monthly active users. Getting it wrong the other way
 * is merely broken — Next cannot fetch a `blob:` URL that exists only in the
 * viewer's browser, so the image fails to render.
 */

import { describe, expect, it } from "vitest";
import { requiresUnoptimizedImage } from "./optimizable";

describe("requiresUnoptimizedImage", () => {
  it("bypasses the optimizer for browser-only URLs", () => {
    // A freshly previewed upload before it reaches storage.
    expect(requiresUnoptimizedImage("blob:https://verkli.com/8f2c-…")).toBe(true);
    expect(requiresUnoptimizedImage("data:image/png;base64,iVBORw0KG…")).toBe(true);
  });

  it("optimizes remote covers", () => {
    expect(
      requiresUnoptimizedImage(
        "https://glfipbnsyxowqsmcuzcm.supabase.co/storage/v1/object/public/book_covers/x/y.png"
      )
    ).toBe(false);
    expect(requiresUnoptimizedImage("https://images.unsplash.com/photo-1")).toBe(false);
  });

  it("optimizes app-relative paths", () => {
    // /public assets are served by Next and optimize fine.
    expect(requiresUnoptimizedImage("/demo-assets/covers/haunted.png")).toBe(false);
  });

  it("treats a missing src as nothing to bypass", () => {
    // The call sites render `src` only when truthy, so this branch just has to
    // not claim a null needs special handling.
    expect(requiresUnoptimizedImage(null)).toBe(false);
    expect(requiresUnoptimizedImage(undefined)).toBe(false);
    expect(requiresUnoptimizedImage("")).toBe(false);
  });

  it("is not fooled by the scheme appearing later in the URL", () => {
    // A remote URL that merely mentions "data:" or "blob:" must still optimize.
    expect(requiresUnoptimizedImage("https://cdn.example.com/i?u=data:image/png")).toBe(false);
    expect(requiresUnoptimizedImage("https://x.supabase.co/blob:fake.png")).toBe(false);
  });
});
