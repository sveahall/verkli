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
    expect(new URL(res.headers.get("location")!, "http://localhost").href).toBe("http://localhost/reader/home");
  });

  it("rejects protocol-relative redirect targets", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/signout?redirect=//evil.example/phish", {
        method: "POST",
      })
    );

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!, "http://localhost").href).toBe("http://localhost/");
  });

  it("keeps the browser on the public host when the server sees its internal Railway address", async () => {
    const res = await GET(new Request("https://0.0.0.0:8080/api/auth/signout?redirect=/author/signin?next=%2Fauthor%2Fhome", {
      headers: { "sec-fetch-dest": "document", "x-forwarded-host": "untrusted.example" },
    }));

    expect(new URL(res.headers.get("location")!, "https://www.verkli.com").href)
      .toBe("https://www.verkli.com/author/signin?next=/author/home");
  });

  it.each(["/\\evil.example/phish", "/\t/evil.example", "/%5Cevil.example", "/%2Fevil.example", "/safe/..//evil.example/phish", "https://evil.example", "/%broken"])("rejects unsafe redirect %s", async (redirect) => {
    const url = new URL("https://www.verkli.com/api/auth/signout");
    url.searchParams.set("redirect", redirect);
    const res = await POST(new Request(url, { method: "POST" }));

    expect(new URL(res.headers.get("location")!, "https://www.verkli.com").href)
      .toBe("https://www.verkli.com/");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
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
