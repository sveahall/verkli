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

  // Was "names the book and its price, so the preview is an actual offer",
  // asserting the price in the description. Retired 2026-09-07: it is not an
  // actual offer. Production carries a Stripe TEST key, so the card is declined
  // at checkout — and BETA_LOCK makes this page the front door of verkli.com
  // rather than a link sent to one buyer. Leading a pre-launch landing page with
  // a price that cannot be charged sells the wrong thing twice.
  //
  // The book still has to be NAMED, so the page is findable by people who were
  // sent here for it. The price no longer has to lead.
  it("still names the book and its author in the preview", () => {
    const description = String(metadata.openGraph?.description ?? "");
    expect(description).toContain(TA_FOR_ER_ORDER.bookTitle);
    expect(description).toContain(TA_FOR_ER_ORDER.authorName);
  });

  it("leads with the waitlist, not the book sale", () => {
    // The page's job under BETA_LOCK is to explain that access is gated and how
    // to get in. If this ever fails because the title went book-first again,
    // check whether the live Stripe key landed first — that would make it a
    // reasonable change rather than a regression.
    const title = String(metadata.title).toLowerCase();
    expect(title).toContain("waitlist");
    expect(title).not.toContain(TA_FOR_ER_ORDER.bookTitle.toLowerCase());
  });

  it("keeps the page title and the social title in agreement", () => {
    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.twitter?.title).toBe(metadata.title);
  });

  // The root layout appends " | Verkli" via its title template, so carrying the
  // suffix here too produced it twice on the live page.
  it("does not carry the site suffix that the root template already adds", () => {
    expect(String(metadata.title)).not.toContain("| Verkli");
  });

  // Derived from the order constant rather than retyped, so the preview cannot
  // drift from the book actually being sold. Previously asserted on priceLabel;
  // the description no longer quotes a price (see above), so the same guard now
  // rides on the two fields it does use. Interpolating the constant is the
  // point — a hardcoded "Ta för er!" here would survive a rename of the book.
  it("derives its copy from the order constant", () => {
    const description = String(metadata.openGraph?.description);
    expect(description).toContain(TA_FOR_ER_ORDER.bookTitle);
    expect(description).toContain(TA_FOR_ER_ORDER.authorName);
    // Guards the interpolation itself: if the template were retyped as a
    // literal, changing the constant would leave the description behind.
    expect(description).toContain(
      `${TA_FOR_ER_ORDER.bookTitle} by ${TA_FOR_ER_ORDER.authorName}`
    );
  });
});
