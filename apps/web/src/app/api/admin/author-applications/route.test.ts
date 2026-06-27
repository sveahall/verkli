import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_APPLICATIONS_LOAD_FAILED,
  E_USER_ID_REQUIRED,
  E_INVALID_STATUS_VALUE,
  E_APPLICATION_UPDATE_FAILED,
  E_APPLICATION_CREATION_FAILED,
} from "@/lib/api-errors";

/* ── hoisted mocks ─────────────────────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
  getServerEnv: vi.fn(),
  resendSend: vi.fn(),
  getUserEmailMap: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRoleForApi: mocks.requireAdminRoleForApi,
}));

vi.mock("@/lib/admin/user-emails", () => ({
  getUserEmailMap: mocks.getUserEmailMap,
  getUserEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getServerEnv: mocks.getServerEnv,
    getRedisUrl: () => null,
    getRedisConnectionOptions: () => undefined,
    getRedisClientOptions: () => undefined,
  };
});

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mocks.resendSend },
  })),
}));

vi.mock("@/lib/emails/author-application-status", () => ({
  buildApplicationStatusSubject: () => "Subject",
  buildApplicationStatusHtml: () => "<p>html</p>",
}));

const { GET, PATCH } = await import("./route");

/* ── helpers ───────────────────────────────────────────────────────────────── */

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/admin/author-applications", {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function adminAllowed() {
  mocks.requireAdminRoleForApi.mockResolvedValue({
    user: { id: "admin-1" },
    response: null,
  });
}

function adminDenied(status: 401 | 403) {
  const resp = new Response(JSON.stringify({ error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }), { status });
  mocks.requireAdminRoleForApi.mockResolvedValue({
    user: null,
    response: resp,
  });
}

/** Build a chainable Supabase mock that supports .from(...).select(...).order(...) etc. */
function buildFromMock(tables: Record<string, unknown>) {
  const from = vi.fn((table: string) => {
    if (table in tables) return tables[table];
    throw new Error(`Unexpected table in test: ${table}`);
  });
  mocks.createAdminClient.mockReturnValue({ from });
  return from;
}

/* ── test suite ────────────────────────────────────────────────────────────── */

describe("GET /api/admin/author-applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Emails are resolved via the auth.users helper; default to empty.
    mocks.getUserEmailMap.mockResolvedValue(new Map<string, string>());
  });

  it("returns 401 without authenticated user", async () => {
    adminDenied(401);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    adminDenied(403);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns applications list on success", async () => {
    adminAllowed();

    const apps = [
      { user_id: "u1", status: "pending", created_at: "2026-01-01", first_name: "A", last_name: "B", email: "a@b.com", has_published_before: false, published_books_url: null },
    ];

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: apps, error: null }),
        })),
      },
    });
    mocks.getUserEmailMap.mockResolvedValue(new Map([["u1", "auth@b.com"]]));

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].user_id).toBe("u1");
    expect(body.applications[0].auth_email).toBe("auth@b.com");
  });

  it("returns 500 when database query fails", async () => {
    adminAllowed();

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
        })),
      },
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_APPLICATIONS_LOAD_FAILED);
  });
});

describe("PATCH /api/admin/author-applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getServerEnv.mockReturnValue({
      RESEND_API_KEY: "re_test",
      RESEND_FROM_EMAIL: "noreply@test.com",
    });
    mocks.resendSend.mockResolvedValue({ error: null });
  });

  it("returns 401 without authenticated user", async () => {
    adminDenied(401);
    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    adminDenied(403);
    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when userId is missing", async () => {
    adminAllowed();
    const res = await PATCH(makeRequest("PATCH", { status: "approved" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_USER_ID_REQUIRED);
  });

  it("returns 400 for invalid status value", async () => {
    adminAllowed();
    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "banana" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_STATUS_VALUE);
  });

  it("approves an existing application", async () => {
    adminAllowed();

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const profileUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn(() => ({
        neq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn()
              .mockResolvedValueOnce({ data: { user_id: "u1" } }) // existing check
              .mockResolvedValueOnce({ data: { email: "user@test.com", first_name: "Anna" } }), // email lookup
          })),
        })),
        update: updateFn,
      },
      profiles: { update: profileUpdateFn },
    });

    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("approved");
    expect(updateFn).toHaveBeenCalledWith({ status: "approved" });
    expect(profileUpdateFn).toHaveBeenCalledWith({ role: "author" });
  });

  it("rejects an existing application", async () => {
    adminAllowed();

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn()
              .mockResolvedValueOnce({ data: { user_id: "u1" } })
              .mockResolvedValueOnce({ data: { email: "user@test.com", first_name: null } }),
          })),
        })),
        update: updateFn,
      },
    });

    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "rejected" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("rejected");
    expect(updateFn).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("creates a new application record when none exists", async () => {
    adminAllowed();

    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const profileUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn(() => ({
        neq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn()
              .mockResolvedValueOnce({ data: null }) // no existing
              .mockResolvedValueOnce({ data: { email: null, first_name: null } }),
          })),
        })),
        insert: insertFn,
      },
      profiles: { update: profileUpdateFn },
    });

    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(insertFn).toHaveBeenCalledWith({ user_id: "u1", status: "approved" });
    expect(profileUpdateFn).toHaveBeenCalledWith({ role: "author" });
  });

  it("returns 500 when update fails", async () => {
    adminAllowed();

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ data: { user_id: "u1" } }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
        }),
      },
    });

    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_APPLICATION_UPDATE_FAILED);
  });

  it("returns 500 when insert fails", async () => {
    adminAllowed();

    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
          })),
        })),
        insert: vi.fn().mockResolvedValue({ error: { message: "insert failed" } }),
      },
    });

    const res = await PATCH(makeRequest("PATCH", { userId: "u1", status: "rejected" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_APPLICATION_CREATION_FAILED);
  });
});
