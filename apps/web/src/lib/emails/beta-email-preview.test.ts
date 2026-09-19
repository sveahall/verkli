import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

const { default: Page } = await import("@/app/dev/beta-emails/page");

afterEach(() => vi.unstubAllEnvs());

describe("beta email preview", () => {
  it.each(["production", "test"] as const)("is unavailable in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => Page()).toThrow("NOT_FOUND");
  });

  it("renders six safe examples and the actual invitation HTML in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const $ = load(renderToStaticMarkup(Page()));

    for (const label of ["Author · new account", "Author · existing account", "Reader · new account", "Reader · existing account", "Author · waiting", "Reader · waiting"]) {
      expect($("button").text()).toContain(label);
    }
    expect($("body").text()).toContain("Preview only. No emails are sent.");
    const frame = $("iframe");
    expect(frame.attr("sandbox")).toBe("");
    const email = load(frame.attr("srcdoc") ?? "");
    expect(email("a[href='https://www.verkli.com/author/signup']")).toHaveLength(1);
    expect(email("body").text()).toContain("author@example.com");
    expect(email("body").text()).toContain("Your first steps");
  });
});
