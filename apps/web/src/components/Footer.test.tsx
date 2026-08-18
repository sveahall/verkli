import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("@/lib/flags", () => ({
  getDiscoverHref: () => "/reader/discover",
}));

const { default: Footer } = await import("./Footer");

function render() {
  return renderToStaticMarkup(<Footer variant="reader" />);
}

describe("Footer", () => {
  it("links to the support page", () => {
    expect(render()).toContain('href="/support"');
  });

  it("keeps the legal routes reachable alongside support", () => {
    const html = render();

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("offers a real contact address", () => {
    expect(render()).toContain("mailto:hello@verkli.com");
  });

  it("makes no uptime claim, having no status source to back one", () => {
    // Regression guard: this slot hard-coded "All systems operational" plus a
    // green dot, true even during an outage.
    expect(render()).not.toContain("All systems operational");
  });
});
