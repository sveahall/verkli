import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  permanentRedirect: mocks.permanentRedirect,
}));

// The bug this guards: the route used to `import ReaderLanding from "../page"`
// and render it, so /reader/faq served the reader marketing landing page.
vi.mock("../page", () => ({
  default: vi.fn(() => null),
}));

const { default: ReaderFaqPage } = await import("./page");

describe("/reader/faq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the support page", () => {
    expect(() => ReaderFaqPage()).toThrow("NEXT_REDIRECT:/support");
    expect(mocks.permanentRedirect).toHaveBeenCalledExactlyOnceWith("/support");
  });

  it("does not render the reader landing page", async () => {
    const landing = await import("../page");

    expect(() => ReaderFaqPage()).toThrow();
    expect(landing.default).not.toHaveBeenCalled();
  });
});
