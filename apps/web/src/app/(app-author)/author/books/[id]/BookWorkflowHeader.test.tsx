import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { Tool } from "./editor/bookEditor.shared";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { default: BookWorkflowHeader } = await import("./BookWorkflowHeader");

const tools = [
  "edit",
  "cover",
  "audiobook",
  "translate",
  "pricing",
  "publish",
  "review",
] as const;

function renderWorkflow(activeTool: Tool, workflowTools: Tool[] = [...tools]) {
  return load(renderToStaticMarkup(
    <BookWorkflowHeader
      bookId="book-1"
      activeTool={activeTool}
      tools={workflowTools}
    />
  ));
}

describe("BookWorkflowHeader", () => {
  it("renders one direct, labelled link for each workflow step", () => {
    const $ = renderWorkflow("translate");
    const stepLinks = $('nav[aria-label="Book workflow"] a[aria-label$=" workflow step"]');

    expect(stepLinks).toHaveLength(tools.length);
    expect($('nav a').not('[aria-label^="Back to "], [aria-label^="Continue to "]')).toHaveLength(tools.length);

    for (const [index, tool] of tools.entries()) {
      const label = ["Write", "Cover", "Audio", "Translate", "Pricing", "Publish", "Review"][index];
      const href =
        tool === "edit"
          ? "/author/books/book-1"
          : `/author/books/book-1?panel=${tool}`;
      const link = stepLinks.filter(`[aria-label="${label} workflow step"]`);

      expect(link, `${tool} link`).toHaveLength(1);
      expect(link.attr("href")).toBe(href);
      expect(link.text()).toBe(label);
      expect(link.find('[aria-hidden="true"]')).toHaveLength(1);
    }
  });

  it("identifies only the active workflow step as current", () => {
    const $ = renderWorkflow("pricing");
    const current = $('a[aria-current="step"]');

    expect(current).toHaveLength(1);
    expect(current.attr("href")).toBe("/author/books/book-1?panel=pricing");
    expect(current.attr("aria-label")).toBe("Pricing workflow step");
    expect(current.text()).toBe("Pricing");
  });

  it.each([
    ["edit", null, "Continue to Cover", "cover"],
    ["translate", "Back to Audio", "Continue to Pricing", "pricing"],
    ["review", "Back to Publish", null, null],
  ] as const)("preserves adjacent-step controls at %s", (activeTool, backLabel, nextLabel, nextTool) => {
    const $ = renderWorkflow(activeTool);
    const back = $('a[aria-label^="Back to "]');
    const next = $('a[aria-label^="Continue to "]');

    expect(back).toHaveLength(backLabel ? 1 : 0);
    expect(next).toHaveLength(nextLabel ? 1 : 0);
    if (backLabel) {
      expect(back.attr("aria-label")).toBe(backLabel);
      const previousTool = activeTool === "review" ? "publish" : "audiobook";
      expect(back.attr("href")).toBe(`/author/books/book-1?panel=${previousTool}`);
    }
    if (nextLabel) {
      expect(next.attr("aria-label")).toBe(nextLabel);
      expect(next.attr("href")).toBe(`/author/books/book-1?panel=${nextTool}`);
    }
  });

  it("does not claim a current step or adjacent controls for an ancillary panel", () => {
    const $ = renderWorkflow("statistics", [...tools, "statistics"]);

    expect($('[aria-current]')).toHaveLength(0);
    expect($('a[aria-label^="Back to "], a[aria-label^="Continue to "]')).toHaveLength(0);
    expect($('a[href$="panel=statistics"]')).toHaveLength(0);
  });
});
