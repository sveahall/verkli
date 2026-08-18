import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/reader/home",
}));

const { ErrorBanner } = await import("./ErrorBanner");

function render(errorCode: string) {
  return renderToStaticMarkup(<ErrorBanner errorCode={errorCode} />);
}

describe("ErrorBanner", () => {
  it("points the server_error advice at a real support route", () => {
    const html = render("server_error");

    // The copy told readers to "contact support" while no support route
    // existed anywhere in the app.
    expect(html).toContain("Contact support");
    expect(html).toContain('href="/support"');
  });

  it("gives unknown error codes the same escape hatch", () => {
    const html = render("some_code_we_never_shipped");

    expect(html).toContain('href="/support"');
  });

  it("renders nothing without an error code", () => {
    expect(renderToStaticMarkup(<ErrorBanner />)).toBe("");
  });
});
