import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const originalEnv = process.env.ADMIN_API_KEY;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  })),
}));

describe("GET /api/admin/feedback", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = "secret-admin-key";
  });


  afterEach(() => {
    process.env.ADMIN_API_KEY = originalEnv;
  });

  it("returns 403 without x-admin-key", async () => {
    const req = new Request("http://localhost/api/admin/feedback");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 with wrong x-admin-key", async () => {
    const req = new Request("http://localhost/api/admin/feedback", {
      headers: { "x-admin-key": "wrong" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 with correct x-admin-key", async () => {
    const req = new Request("http://localhost/api/admin/feedback", {
      headers: { "x-admin-key": "secret-admin-key" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("feedback");
  });
});
