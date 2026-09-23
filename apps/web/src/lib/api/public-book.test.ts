import { describe, expect, it } from "vitest";
import {
  buildFormats,
  buildPricing,
  toPublicBookDetail,
  toPublicBookSummary,
  type AuthorRow,
  type BookRow,
} from "./public-book";

const baseBook: BookRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "nordic-noir",
  title: "Nordic Noir",
  description: "A dark thriller.",
  cover_image: "https://cdn/example.jpg",
  author_id: "22222222-2222-4222-8222-222222222222",
  language: "sv",
  original_language: "sv",
  audiobook_status: null,
  print_on_demand_settings: { enabled: false },
  trailer_url: null,
  price_amount: 4900,
  price_currency: "SEK",
  pricing_model: "book_only",
  is_free: false,
  status: "PUBLISHED",
  published_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-04-12T00:00:00.000Z",
};

const author: AuthorRow = {
  user_id: "22222222-2222-4222-8222-222222222222",
  display_name: "A. Lindgren",
  username: "alindgren",
};

describe("buildFormats", () => {
  it("always includes text", () => {
    expect(buildFormats(baseBook)).toContain("text");
  });

  it("includes audio when audiobook_status is 'published'", () => {
    const formats = buildFormats({ ...baseBook, audiobook_status: "published" });
    expect(formats).toEqual(expect.arrayContaining(["text", "audio"]));
  });

  it("does not include audio when audiobook_status is 'generating'", () => {
    const formats = buildFormats({ ...baseBook, audiobook_status: "generating" });
    expect(formats).not.toContain("audio");
  });

  it("includes print when print_on_demand_settings.enabled is true", () => {
    const formats = buildFormats({
      ...baseBook,
      print_on_demand_settings: { enabled: true, formats: ["softcover"], softcoverPriceMinor: 19900 },
    });
    expect(formats).toContain("print");
  });
});

describe("buildPricing", () => {
  it("marks book as free when is_free is true", () => {
    const pricing = buildPricing({ ...baseBook, is_free: true });
    expect(pricing.is_free).toBe(true);
    expect(pricing.amount_minor).toBeNull();
  });

  it("marks book as free when amount is zero", () => {
    const pricing = buildPricing({ ...baseBook, price_amount: 0, is_free: false });
    expect(pricing.is_free).toBe(true);
    expect(pricing.amount_minor).toBeNull();
  });

  it("returns paid pricing with amount_minor and currency", () => {
    const pricing = buildPricing({ ...baseBook, price_amount: 4900, price_currency: "SEK", is_free: false });
    expect(pricing).toMatchObject({ is_free: false, amount_minor: 4900, currency: "SEK", model: "book_only" });
  });

  it("falls back to USD for unknown currency", () => {
    const pricing = buildPricing({ ...baseBook, price_currency: "XYZ" });
    expect(pricing.currency).toBe("USD");
  });
});

describe("toPublicBookSummary", () => {
  it("produces stable AI-ready shape", () => {
    const summary = toPublicBookSummary(baseBook, author);
    expect(summary).toMatchObject({
      id: baseBook.id,
      slug: "nordic-noir",
      title: "Nordic Noir",
      description: "A dark thriller.",
      cover_image_url: "https://cdn/example.jpg",
      language: "sv",
      formats: ["text"],
      pricing: { is_free: false, amount_minor: 4900, currency: "SEK", model: "book_only" },
      author: { id: baseBook.author_id, name: "A. Lindgren", username: "alindgren" },
    });
    expect(summary.canonical_url).toContain(`/reader/books/${baseBook.id}`);
    expect(summary.author.url).toContain(`/reader/authors/${baseBook.author_id}`);
  });

  it("falls back author name to username when display_name is empty", () => {
    const summary = toPublicBookSummary(baseBook, { ...author, display_name: null });
    expect(summary.author.name).toBe("alindgren");
  });
});

describe("toPublicBookDetail", () => {
  it("includes genres, available_languages, trailer_url, preview_url", () => {
    const detail = toPublicBookDetail(
      { ...baseBook, trailer_url: "https://cdn/trailer.mp4" },
      author,
      [
        { name_en: "Thriller", name: "Thriller" },
        { name_en: null, name: "Romans" },
      ],
      [
        { language_code: "sv", published_at: "2026-03-01T00:00:00.000Z" },
        { language_code: "en", published_at: "2026-04-01T00:00:00.000Z" },
        { language_code: "de", published_at: null },
      ]
    );
    expect(detail.genres).toEqual(["Thriller", "Romans"]);
    expect(detail.available_languages).toEqual(expect.arrayContaining(["sv", "en"]));
    expect(detail.available_languages).not.toContain("de");
    expect(detail.trailer_url).toBe("https://cdn/trailer.mp4");
    expect(detail.preview_url).toBeNull();
  });
});
