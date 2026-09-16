import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookWorkflowHeader from "./BookWorkflowHeader";
import { TOOL_ORDER } from "./editor/bookEditor.shared";

// These checks protect navigation semantics; pointer/focus/overflow regressions
// run against the real components in scripts/qa-book-workflow.mjs.
describe("book workflow navigation", () => {
  it("groups the manuscript before editions and keeps pricing before publish", () => {
    const html = renderToStaticMarkup(<BookWorkflowHeader bookId="test-book" activeTool="pricing" tools={TOOL_ORDER} />);
    expect(TOOL_ORDER.indexOf("review")).toBeLessThan(TOOL_ORDER.indexOf("cover"));
    expect(html).toContain('aria-label="Manuscript"');
    expect(html).toContain('aria-label="Editions"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Back to Audio"');
    expect(html).toContain('aria-label="Continue to Publish"');
    expect(html.indexOf('>Pricing</a>')).toBeLessThan(html.indexOf('>Publish</a>'));
  });

  it("keeps ancillary tools out of the linear workflow", () => {
    const html = renderToStaticMarkup(<BookWorkflowHeader bookId="test-book" activeTool="cover" tools={["edit", "ai", "cover", "statistics", "pricing", "publish"]} />);
    expect(html).not.toContain('panel=ai');
    expect(html).not.toContain('panel=statistics');
    expect(html).toContain('aria-label="Continue to Pricing"');
  });
  it("does not show a misleading next step for a tool outside the rail", () => {
    const html = renderToStaticMarkup(<BookWorkflowHeader bookId="test-book" activeTool="print" tools={TOOL_ORDER} />);
    expect(html).not.toContain('aria-label="Continue to');
    expect(html).not.toContain('aria-current="step"');
  });
});
