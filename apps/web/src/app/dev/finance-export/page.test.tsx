import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./FinanceExportPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());

describe("finance and reading export UI fixture", () => {
  it.each(["production", "test"])("cannot be opened in %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(Page({})).rejects.toThrow("NOT_FOUND");
  });
  it("uses Swedish payout copy when the preview locale is Swedish", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = await Page({ searchParams: Promise.resolve({ locale: "sv" }) });
    expect(page.props.children.props.t("title")).toBe("Utbetalningar");
  });
  it("is available only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await Page({})).toBeTruthy();
  });
});
