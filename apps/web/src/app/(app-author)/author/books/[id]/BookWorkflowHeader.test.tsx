import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookWorkflowHeader from "./BookWorkflowHeader";
import { TOOL_ORDER } from "./editor/bookEditor.shared";

// These checks protect navigation semantics; pointer/focus/overflow regressions
// run against the real components in scripts/qa-book-workflow.mjs.
describe("book workflow navigation", () => {
  it("keeps one current step and pricing immediately before publish", () => {
    const html = renderToStaticMarkup(<BookWorkflowHeader bookId="test-book" activeTool="pricing" tools={TOOL_ORDER} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Back to Translate"');
    expect(html).toContain('aria-label="Continue to Publish"');
    expect(html.indexOf('>Pricing</a>')).toBeLessThan(html.indexOf('>Publish</a>'));
  });

  it("keeps ancillary tools out of the linear workflow", () => {
    const html = renderToStaticMarkup(<BookWorkflowHeader bookId="test-book" activeTool="cover" tools={["edit", "ai", "cover", "statistics", "pricing", "publish"]} />);
    expect(html).not.toContain('panel=ai');
    expect(html).not.toContain('panel=statistics');
    expect(html).toContain('aria-label="Continue to Pricing"');
  });
});
