import { NextResponse } from "next/server";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
}

export function GET() {
  const base = siteUrl();
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Verkli Public API",
      version: "1.0.0",
      description:
        "Read-only discovery API for AI agents and integrators. Exposes only published books and public authors. No auth required. Rate limited per IP (60 req/min).",
      contact: { name: "Verkli", url: base },
    },
    servers: [{ url: `${base}/api/public` }],
    paths: {
      "/books": {
        get: {
          summary: "List published books",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "q", in: "query", description: "Title search (case-insensitive)", schema: { type: "string" } },
            { name: "language", in: "query", description: "BCP-47 / ISO-639 code, e.g. 'en' or 'sv'", schema: { type: "string" } },
            { name: "is_free", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          ],
          responses: {
            "200": {
              description: "Paginated list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BookListResponse" },
                  example: {
                    items: [
                      {
                        id: "00000000-0000-4000-8000-000000000001",
                        slug: "nordic-noir",
                        title: "Nordic Noir",
                        description: "A dark thriller set in the Stockholm archipelago.",
                        cover_image_url: "https://verkli.com/covers/abc.jpg",
                        language: "sv",
                        formats: ["text", "audio"],
                        pricing: {
                          is_free: false,
                          amount_minor: 4900,
                          currency: "SEK",
                          model: "book_only",
                        },
                        author: {
                          id: "00000000-0000-4000-8000-000000000002",
                          name: "A. Lindgren",
                          username: "alindgren",
                          url: "https://verkli.com/reader/authors/00000000-0000-4000-8000-000000000002",
                        },
                        canonical_url:
                          "https://verkli.com/reader/books/00000000-0000-4000-8000-000000000001",
                        updated_at: "2026-04-12T08:00:00.000Z",
                        published_at: "2026-03-01T08:00:00.000Z",
                      },
                    ],
                    total: 1,
                    page: 1,
                    limit: 20,
                  },
                },
              },
            },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/books/{id}": {
        get: {
          summary: "Get a single published book by UUID or slug",
          description:
            "Accepts either a book UUID or a book slug. UUIDs are matched against `id`; everything else is matched against `slug`. Slug lookup is convenient for AI agents that have only seen the human-readable URL.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Book UUID or slug",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Book detail",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BookDetail" },
                },
              },
            },
            "404": { description: "Book not found or not published" },
          },
        },
      },
      "/authors/{id}": {
        get: {
          summary: "Get a public author profile and their published books",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Author detail",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthorDetail" },
                },
              },
            },
            "404": { description: "Author is private and has no published books" },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "This OpenAPI document",
          responses: { "200": { description: "OpenAPI 3.1 document" } },
        },
      },
    },
    components: {
      schemas: {
        BookSummary: {
          type: "object",
          required: ["id", "slug", "title", "formats", "pricing", "author", "canonical_url", "updated_at"],
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            cover_image_url: { type: "string", nullable: true },
            language: { type: "string", nullable: true },
            formats: {
              type: "array",
              items: { type: "string", enum: ["text", "audio", "print"] },
            },
            pricing: { $ref: "#/components/schemas/Pricing" },
            author: { $ref: "#/components/schemas/AuthorRef" },
            canonical_url: { type: "string", format: "uri" },
            updated_at: { type: "string", format: "date-time" },
            published_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        BookDetail: {
          allOf: [
            { $ref: "#/components/schemas/BookSummary" },
            {
              type: "object",
              properties: {
                genres: { type: "array", items: { type: "string" } },
                available_languages: { type: "array", items: { type: "string" } },
                preview_url: { type: "string", format: "uri", nullable: true },
                trailer_url: { type: "string", format: "uri", nullable: true },
              },
            },
          ],
        },
        BookListResponse: {
          type: "object",
          required: ["items", "total", "page", "limit"],
          properties: {
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/BookSummary" },
            },
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
          },
        },
        Pricing: {
          type: "object",
          required: ["is_free", "currency", "model"],
          properties: {
            is_free: { type: "boolean" },
            amount_minor: {
              type: "integer",
              nullable: true,
              description:
                "Price in minor currency units (e.g. öre/cents). Divide by 100 for major units.",
            },
            currency: { type: "string", enum: ["SEK", "EUR", "USD"] },
            model: { type: "string", enum: ["book_only", "per_chapter"] },
          },
        },
        AuthorRef: {
          type: "object",
          required: ["id", "name", "url"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            username: { type: "string", nullable: true },
            url: { type: "string", format: "uri" },
          },
        },
        AuthorDetail: {
          type: "object",
          required: ["id", "name", "canonical_url", "books"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            username: { type: "string", nullable: true },
            bio: { type: "string", nullable: true },
            avatar_url: { type: "string", nullable: true },
            website_url: { type: "string", nullable: true },
            same_as: { type: "array", items: { type: "string", format: "uri" } },
            canonical_url: { type: "string", format: "uri" },
            books: {
              type: "array",
              items: { $ref: "#/components/schemas/BookSummary" },
            },
          },
        },
      },
    },
  } as const;

  return NextResponse.json(spec, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
