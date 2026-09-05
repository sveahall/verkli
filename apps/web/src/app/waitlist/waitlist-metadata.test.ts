import { describe, expect, it } from "vitest";
import { metadata } from "./layout";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

/**
 * The link preview for the page that sells the book.
 *
 * The bug these guard: this layout set only `title` and `description`, and
 * Next does NOT derive `openGraph` from those. So the `<title>` tag was right
 * while every pasted link — WhatsApp, Slack, anywhere reading `og:*` — showed
 * the root layout's generic card instead: "Verkli", "the platform for authors
 * and readers", and a logo on a dark gradient. Nothing about the book, no
 * cover, no price, no reason for the recipient to click.
 *
 * A second, quieter bug went with it: the title was written as the literal
 * "Join the waitlist | Verkli" while the root layout applies
 * `template: "%s | Verkli"`, so the live page served
 * `<title>Join the waitlist | Verkli | Verkli</title>`.
 */

/** The root layout's values. Inheriting these on this route IS the bug. */
const ROOT_TITLE = "Verkli";
const ROOT_DESCRIPTION = "Verkli — the platform for authors and readers.";

describe("waitlist metadata", () => {
  it("sets openGraph explicitly instead of inheriting the root card", () => {
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.title).toBeDefined();
    expect(metadata.openGraph?.description).toBeDefined();
    expect(metadata.openGraph?.title).not.toBe(ROOT_TITLE);
    expect(metadata.openGraph?.description).not.toBe(ROOT_DESCRIPTION);
  });

  it("sets twitter explicitly too, since it falls back the same way", () => {
    expect(metadata.twitter).toBeDefined();
    expect(metadata.twitter?.title).not.toBe(ROOT_TITLE);
    expect(metadata.twitter?.description).not.toBe(ROOT_DESCRIPTION);
  });

  it("names the book and its price, so the preview is an actual offer", () => {
    const description = String(metadata.openGraph?.description ?? "");
    expect(description).toContain(TA_FOR_ER_ORDER.bookTitle);
    expect(description).toContain(TA_FOR_ER_ORDER.authorName);
    expect(description).toContain(TA_FOR_ER_ORDER.priceLabel);
  });

  it("keeps the page title and the social title in agreement", () => {
    expect(String(metadata.title)).toContain(TA_FOR_ER_ORDER.bookTitle);
    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.twitter?.title).toBe(metadata.title);
  });

  // The root layout appends " | Verkli" via its title template, so carrying the
  // suffix here too produced it twice on the live page.
  it("does not carry the site suffix that the root template already adds", () => {
    expect(String(metadata.title)).not.toContain("| Verkli");
  });

  // Derived from the order constant rather than retyped, so the preview cannot
  // drift from the price the buyer is actually charged.
  it("derives its copy from the order constant", () => {
    expect(TA_FOR_ER_ORDER.priceLabel).toBe("249 kr");
    expect(String(metadata.openGraph?.description)).toContain(
      TA_FOR_ER_ORDER.priceLabel
    );
  });
});
