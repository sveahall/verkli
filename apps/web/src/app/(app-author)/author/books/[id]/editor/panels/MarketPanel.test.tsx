import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MarketPanel from "./MarketPanel";
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
describe("draft book marketing", () => {
  it("lets an unpublished book create copy and trailers without advertising a public reader link", () => {
    const html = renderToStaticMarkup(<MarketPanel bookId="draft-book" isPublished={false} marketingCampaigns={[]} isProLocked={false} proLockMessage="" billingLoading={false} onGenerateCopy={async () => {}} isGenerating={false} bookTitle="Draft book" />);
    expect(html).toContain("Generate AI draft");
    expect(html).not.toContain("Publish first");
    expect(html).not.toContain('href="/reader/books/draft-book"');
    expect(html).toContain("Closed beta");
  });
});
