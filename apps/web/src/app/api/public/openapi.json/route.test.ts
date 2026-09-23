import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/api/public/openapi.json GET", () => {
  it("returns a valid OpenAPI 3.1 document with the public endpoints", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toMatch(/^3\.1/);
    expect(body.paths["/books"]).toBeDefined();
    expect(body.paths["/books/{id}"]).toBeDefined();
    expect(body.paths["/authors/{id}"]).toBeDefined();
    expect(body.components.schemas.BookSummary).toBeDefined();
    expect(body.components.schemas.AuthorDetail).toBeDefined();
  });
});
