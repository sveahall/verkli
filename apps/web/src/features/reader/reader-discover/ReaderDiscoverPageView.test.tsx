import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import ReaderDiscoverPageView from "./ReaderDiscoverPageView";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

function render(genreSlugs = ["fiction"]) {
  return load(renderToStaticMarkup(<ReaderDiscoverPageView
    languageLabel="English"
    languageOptions={[{ value: "en", label: "English", href: "/reader/discover", active: true }]}
    books={[]}
    authors={[]}
    genres={[{ id: "fiction", slug: "fiction", label: "Fiction", icon: null }]}
    activeFilters={{ query: "story", language: "en", genreSlugs, format: "audiobook", sort: "title" }}
    resultCount={0}
  />));
}

describe("ReaderDiscoverPageView", () => {
  it("preserves format and sort when applying a language change", () => {
    const $ = render();
    const form = $('select[name="lang"]').closest("form");
    expect(form.find('input[name="format"]').attr("value")).toBe("audiobook");
    expect(form.find('input[name="sort"]').attr("value")).toBe("title");
    expect(form.find('input[name="q"]').attr("value")).toBe("story");
    expect(form.find('input[name="genre"]').attr("value")).toBe("fiction");
  });

  it("exposes selected genres to assistive technology", () => {
    const $ = render();
    expect($("a").filter((_, el) => $(el).text() === "Fiction").attr("aria-current")).toBe("true");
    expect($("a").filter((_, el) => $(el).text() === "All genres").attr("aria-current")).toBeUndefined();
    const all = render([]);
    expect(all("a").filter((_, el) => all(el).text() === "All genres").attr("aria-current")).toBe("true");
  });

  it("keeps the no-match recovery visible without inventing books", () => {
    const $ = render();
    expect($("h2").text()).toContain("No books match your filters");
    expect($("a").filter((_, el) => $(el).text() === "Clear all filters").attr("href")).toBe("/reader/discover");
  });
});
