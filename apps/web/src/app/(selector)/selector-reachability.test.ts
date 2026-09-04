import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

/**
 * The homepage must link to the two things a stranger arrives wanting: the book,
 * and what this costs.
 *
 * Probed on 2026-09-04: `/`, `/reader/discover` and `/reader/home` contained
 * zero references to `/waitlist`, which is where the order form lives. The book
 * was unreachable from anywhere on the site — you had to already know the URL.
 *
 * Not a code regression, a consequence of turning the lock off: with
 * `NEXT_PUBLIC_WAITLIST_ONLY=true` the middleware 307'd everything to
 * /waitlist, so the book WAS the homepage. Opening the site made this role
 * chooser the homepage and orphaned the only thing on it you can buy.
 *
 * `/pricing` was the same story: live, returning 200 without a login, and linked
 * from no page on the site. Someone deciding whether to publish here needs the
 * price before they are asked to pick a role.
 *
 * Source-level assertions, matching `waitlist-mobile.test.ts` — this repo runs
 * vitest in `node` with no @testing-library/react, so there is no DOM to render
 * into.
 */

const SOURCE = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

/** The full JSX tag text for the first <Link> whose href is `href`. */
function linkTag(href: string): string | null {
  const tags = SOURCE.match(/<Link[\s\S]*?>/g) ?? [];
  return tags.find((tag) => tag.includes(`href="${href}"`)) ?? null;
}

describe("role chooser links to the book", () => {
  it("references /waitlist at all", () => {
    expect(SOURCE).toContain('href="/waitlist"');
  });

  // A real anchor, not another onClick. The two role buttons are <button
  // onClick> and so are invisible to a crawler and to anyone without JS. That is
  // a defensible trade for a preference toggle and not for a purchase path.
  it("uses a Link rather than a click handler, so it works without JS", () => {
    const tag = linkTag("/waitlist");
    expect(tag).not.toBeNull();
    expect(tag).not.toContain("onClick");
  });

  // The exact shape of the bug 79a9e19 fixed one page over: an affordance that
  // existed but was hidden on the devices most people arrive on.
  it("is not hidden on mobile behind a breakpoint", () => {
    const tag = linkTag("/waitlist") ?? "";
    const className = tag.match(/className="([^"]*)"/)?.[1] ?? "";
    expect(className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(className).not.toMatch(/(sm|md|lg):(flex|block|inline-flex)/);
  });

  // DESIGN.md:159 — every interactive element meets 44x44. `.btn-ghost` carries
  // a 40px allowance (DESIGN.md:150); on a purchase path take the larger.
  it("meets the 44px touch target", () => {
    const tag = linkTag("/waitlist") ?? "";
    const className = tag.match(/className="([^"]*)"/)?.[1] ?? "";
    expect(className).toMatch(/min-h-(11|\[44px\])/);
  });

  it("names the book, from the order constant rather than a retyped string", () => {
    expect(SOURCE).toContain("TA_FOR_ER_ORDER.bookTitle");
    expect(SOURCE).toContain('from "@/lib/orders/ta-for-er"');
    // Guards against someone "simplifying" it back to a hardcoded title that
    // then drifts from the product.
    expect(SOURCE).not.toContain(`>${TA_FOR_ER_ORDER.bookTitle}<`);
  });
});

describe("role chooser links to pricing", () => {
  it("references /pricing at all", () => {
    expect(SOURCE).toContain('href="/pricing"');
  });

  it("uses a Link, so it works without JS and a crawler can see it", () => {
    const tag = linkTag("/pricing");
    expect(tag).not.toBeNull();
    expect(tag).not.toContain("onClick");
  });

  it("is not hidden on mobile behind a breakpoint", () => {
    const tag = linkTag("/pricing") ?? "";
    const className = tag.match(/className="([^"]*)"/)?.[1] ?? "";
    expect(className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(className).not.toMatch(/(sm|md|lg):(flex|block|inline-flex)/);
  });

  it("meets the 44px touch target", () => {
    const tag = linkTag("/pricing") ?? "";
    const className = tag.match(/className="([^"]*)"/)?.[1] ?? "";
    expect(className).toMatch(/min-h-(11|\[44px\])/);
  });

  // The header spans the viewport so the logo stays left and this sits right.
  // Reverting it to `left-6` would stack the two links on top of each other.
  it("sits in a header that spans the viewport", () => {
    const header = SOURCE.match(/<header className="([^"]*)"/)?.[1] ?? "";
    expect(header).toMatch(/inset-x-6/);
    expect(header).toMatch(/justify-between/);
  });
});
