import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The waitlist page sells Johan's book. Reported 2026-09-04: "you can't see and
 * buy Johan's book on our site if you look on mobile." Two separate causes, both
 * invisible on a desktop browser:
 *
 * 1. The only affordance saying the book existed below the full-height hero was
 *    a scroll cue classed `hidden ... md:flex` — desktop only. On a phone the
 *    hero filled the screen and nothing suggested there was more.
 *
 * 2. Every input was 15px. iOS Safari zooms the viewport when a focused input is
 *    under 16px, so tapping any field threw the layout around. DESIGN.md rule 5
 *    already forbids body text under 16px on mobile.
 */

const DIR = __dirname;

function source(file: string): string {
  return readFileSync(path.join(DIR, file), "utf8");
}

/** Every className string on an <input> element in the file. */
function inputClassNames(src: string): string[] {
  const found: string[] = [];

  // Inputs whose classes are written inline on the element.
  for (const tag of src.match(/<input[\s\S]*?\/>/g) ?? []) {
    const cls = tag.match(/className=(?:"([^"]*)"|\{([A-Za-z0-9_]+)\})/);
    if (!cls) continue;
    if (cls[1]) found.push(cls[1]);
    else if (cls[2]) {
      // Shared constant, e.g. className={inputClass}
      const decl = src.match(new RegExp(`const ${cls[2]}\\s*=\\s*\n?\\s*"([^"]*)"`));
      if (decl) found.push(decl[1]);
    }
  }

  return found;
}

/** The px size that applies before any breakpoint prefix — i.e. on a phone. */
function baseFontSizePx(className: string): number | null {
  const base = className
    .split(/\s+/)
    .filter((c) => /^text-\[\d+px\]$/.test(c))
    .pop();
  return base ? Number(base.replace(/\D/g, "")) : null;
}

describe("waitlist page on mobile", () => {
  const files = ["page.tsx", "BookOrderSection.tsx"];

  it.each(files)("keeps every input at 16px or more on phones (%s)", (file) => {
    const classNames = inputClassNames(source(file));
    expect(classNames.length).toBeGreaterThan(0);

    for (const className of classNames) {
      const size = baseFontSizePx(className);
      if (size === null) continue; // inherits, which is fine
      // Under 16px, iOS Safari zooms the page on focus and the card jumps.
      expect(size, `input styled "${className.slice(0, 60)}…"`).toBeGreaterThanOrEqual(16);
    }
  });

  it("does not hide the way to the book on small screens", () => {
    const src = source("page.tsx");

    // The control that scrolls to the order card. It must not be desktop-only:
    // the hero is min-h-dvh, so without it a phone shows no sign of the book.
    const cue = src.match(/aria-label="Beställ Johans bok nedan"[\s\S]{0,900}?className="([^"]*)"/);
    expect(cue, "scroll cue button not found").not.toBeNull();

    const classes = cue![1].split(/\s+/);
    expect(classes).not.toContain("hidden");
  });

  it("still renders the order section for a phone to scroll to", () => {
    expect(source("BookOrderSection.tsx")).toContain('id="book-order"');
    expect(source("page.tsx")).toContain('getElementById("book-order")');
  });

  // The card sells a physical book. It shipped without a picture of it, and the
  // work that added one lived only on a side branch — so it is pinned here.
  it("shows the book on the order card", () => {
    const src = source("BookOrderSection.tsx");

    expect(src).toContain("/ta-for-er-cover.jpg");
    // A cover with no alt is invisible to anyone using a screen reader.
    expect(src).toMatch(/alt=\{`Omslag: \$\{[^}]+\}/);
  });
});
