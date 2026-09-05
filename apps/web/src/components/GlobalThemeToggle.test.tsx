import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ThemeToggle", () => ({
  default: () => <button aria-label="Theme toggle" type="button" />,
}));

const { default: GlobalThemeToggle } = await import("./GlobalThemeToggle");

describe("GlobalThemeToggle", () => {
  it("keeps the global theme control exposed to assistive technology", () => {
    const html = renderToStaticMarkup(<GlobalThemeToggle />);

    expect(html).toContain('aria-label="Theme toggle"');
    expect(html).not.toContain("aria-hidden");
  });
});
