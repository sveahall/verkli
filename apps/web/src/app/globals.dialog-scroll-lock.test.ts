import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression for "the page does not scroll while the assistant is open".
 *
 * `html:has(dialog[open]) { overflow: hidden }` froze the whole page for ANY
 * open dialog, including the non-modal one the author assistant becomes when it
 * docks beside the canvas. Measured in a browser: page scrolled 0px with the
 * docked panel open, 1000px with `:modal` instead, and a real showModal() dialog
 * stayed correctly locked either way.
 *
 * CSS cannot be exercised in this suite — vitest runs `environment: "node"` — so
 * this asserts the selector itself. It is a guard against the revert, not proof
 * the page scrolls.
 */
const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("dialog scroll lock", () => {
  it("locks the page for modal dialogs only", () => {
    expect(css).toContain("html:has(dialog:modal)");
  });

  it("never locks the page for any open dialog", () => {
    expect(css).not.toMatch(/html:has\(dialog\[open\]\)\s*\{[^}]*overflow\s*:\s*hidden/);
  });
});
