import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  pathname: "/reader/home",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
}));

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

vi.mock("@/lib/active-role", () => ({
  setActiveRoleCookieClient: vi.fn(),
}));

const { default: ReaderAppShell } = await import("./ReaderAppShell");

const FOOTER = <div>footer-sentinel</div>;

function render(footer?: React.ReactNode) {
  return renderToStaticMarkup(
    <ReaderAppShell footer={footer}>
      <p>page body</p>
    </ReaderAppShell>
  );
}

describe("ReaderAppShell", () => {
  beforeEach(() => {
    mocks.pathname = "/reader/home";
  });

  // Found by codex review of the homepage book link. The role chooser redirects
  // any returning visitor with verkli_role in local storage straight to
  // /reader/home or /author/home, so a link that lives only on the chooser
  // reaches first-time visitors and nobody else. The book is the one thing on
  // this site you can buy, so a returning reader must be able to find it from
  // where they actually land.
  it("links to the book order page from the signed-in sidebar", () => {
    const html = render();
    expect(html).toContain('href="/waitlist"');
    expect(html).toContain("Order the book");
  });

  it("links to support from the signed-in sidebar", () => {
    expect(render()).toContain('href="/support"');
  });

  it("renders the footer the route-group layout passes in", () => {
    // The launch-blocking gap: the footer rendered in no authenticated reader
    // layout, so Privacy, Terms and Support were unreachable once signed in.
    expect(render(FOOTER)).toContain("footer-sentinel");
  });

  it("still renders without a footer", () => {
    const html = render();

    expect(html).not.toContain("footer-sentinel");
    expect(html).toContain("page body");
  });

  it("omits the footer on the immersive reading view", () => {
    mocks.pathname = "/reader/read/chapter-1";

    const html = render(FOOTER);

    expect(html).not.toContain("footer-sentinel");
    expect(html).toContain("page body");
  });
});
