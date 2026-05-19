import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { signOut: mockSignOut },
  })),
}));

const { GET, POST } = await import("./route");

describe("/api/auth/signout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("signs out and redirects GET requests to a safe same-origin path", async () => {
    const res = await GET(
      new Request("http://localhost/api/auth/signout?redirect=/reader/home")
    );

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/reader/home");
  });

  it("rejects protocol-relative redirect targets", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/signout?redirect=//evil.example/phish", {
        method: "POST",
      })
    );

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("blocks GET when Sec-Fetch-Dest is not 'document' (prefetch/embed guard)", async () => {
    const res = await GET(
      new Request("http://localhost/api/auth/signout", {
        headers: { "sec-fetch-dest": "image" },
      })
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.status).toBe(405);
  });

  it("sets Cache-Control: no-store on the redirect response", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/signout", { method: "POST" })
    );

    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
