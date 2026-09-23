import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A sweep, not a checklist.
 *
 * Twelve separate mobile defects were found on the reader and purchase path,
 * and every one was the same two mistakes: a form control under 16px, which
 * makes iOS Safari zoom the viewport on focus and throw the layout out from
 * under the thumb, and a tap target under the 44x44 DESIGN.md:159 requires.
 *
 * Asserting the twelve individually would leave the thirteenth free. This walks
 * the reader tree instead, so a control added next month is held to the same
 * rule — which is the only version of this that stays true. `79a9e19` fixed the
 * same class of bug on the waitlist page, `input.tsx` had it one layer down in
 * the design system, and it still reached a reader.
 *
 * Source-level, matching `waitlist-mobile.test.ts`: vitest runs in `node` here
 * with no @testing-library/react, so there is no DOM to measure.
 */

const READER_ROOTS = [
  path.join(__dirname),
  path.join(__dirname, "..", "..", "features", "reader"),
  path.join(__dirname, "..", "..", "components", "ui"),
];

/** Every .tsx under the given roots, tests excluded. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      tsxFiles(full, acc);
    } else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = READER_ROOTS.flatMap((root) => tsxFiles(root));

/**
 * The font size that applies before any breakpoint prefix — i.e. on a phone.
 * Returns null when the class list sets no base size.
 */
function baseFontSizePx(className: string): number | null {
  const named: Record<string, number> = {
    "text-xs": 12,
    "text-sm": 14,
    "text-base": 16,
    "text-lg": 18,
  };
  let found: number | null = null;
  for (const token of className.split(/\s+/)) {
    // A breakpoint-prefixed size does not apply on a phone.
    if (/^(sm|md|lg|xl|2xl):/.test(token)) continue;
    const arbitrary = token.match(/^text-\[(\d+)px\]$/);
    if (arbitrary) found = Number(arbitrary[1]);
    else if (token in named) found = named[token];
  }
  return found;
}

/** className strings on <input>, <select> and <textarea> elements. */
function formControlClassNames(src: string): Array<{ tag: string; className: string }> {
  const out: Array<{ tag: string; className: string }> = [];
  for (const match of src.matchAll(/<(input|select|textarea)\b([\s\S]*?)(?:\/>|>)/g)) {
    const [, tag, attrs] = match;
    const cls = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
    const value = cls?.[1] ?? cls?.[2];
    if (value) out.push({ tag, className: value });
  }
  return out;
}

describe("reader path is usable on a phone", () => {
  it("finds files to check (guards against the sweep silently covering nothing)", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  // The rule: iOS Safari zooms the viewport when a focused control is under
  // 16px. DESIGN.md rule 5 already said this; it was not being followed.
  it("has no form control under 16px on a phone", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const { tag, className } of formControlClassNames(src)) {
        const size = baseFontSizePx(className);
        if (size !== null && size < 16) {
          offenders.push(`${path.relative(process.cwd(), file)} <${tag}> = ${size}px`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * The scan above walks `className=` attributes on elements, and the shared
   * Input primitive composes its classes from a `sizeStyles` map — so the
   * literal size never appears on an <input> tag and the sweep walks straight
   * past the one file that feeds every reader auth form.
   *
   * Found by mutation-testing this suite: reverting `input.tsx` to 15px left
   * the sweep green. A test that passes while the design-system primitive
   * regresses is worse than no test, because it is cited as coverage.
   */
  it("keeps every size in the shared Input primitive at 16px on a phone", () => {
    const src = readFileSync(
      path.join(__dirname, "..", "..", "components", "ui", "input.tsx"),
      "utf8"
    );

    const map = src.match(/const sizeStyles = \{([\s\S]*?)\}/);
    expect(map).not.toBeNull();

    const offenders: string[] = [];
    for (const line of (map?.[1] ?? "").split("\n")) {
      const value = line.match(/"([^"]*)"/)?.[1];
      if (!value) continue;
      const size = baseFontSizePx(value);
      if (size !== null && size < 16) offenders.push(line.trim());
    }

    expect(offenders).toEqual([]);
  });

  // The controls that take money or open a chapter. Named explicitly because
  // these are the ones a reader must be able to hit, and a regression here is
  // worse than elsewhere on the page.
  it.each([
    ["books/[id]/PurchaseChapterButton.tsx", "the buy-a-chapter control"],
    ["books/[id]/OrderPhysicalCopyButton.tsx", "the edition selector above the order button"],
    ["books/[id]/ReviewStars.tsx", "the star rating"],
  ])("keeps %s at the 44px minimum", (relative) => {
    const src = readFileSync(path.join(__dirname, "reader", relative), "utf8");
    expect(src).toMatch(/min-h-11|min-h-\[44px\]|h-11/);
  });
});
