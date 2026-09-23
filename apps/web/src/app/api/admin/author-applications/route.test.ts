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
  getUserById: vi.fn(),
  ensureBetaAuthorAccess: vi.fn(),
  sendBetaWelcome: vi.fn(),
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

vi.mock("@/lib/auth/beta", () => ({
  ensureBetaAuthorAccess: mocks.ensureBetaAuthorAccess,
}));

vi.mock("@/lib/emails/beta-delivery", () => ({
  sendBetaWelcome: mocks.sendBetaWelcome,
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
  mocks.createAdminClient.mockReturnValue({ from, auth: { admin: { getUserById: mocks.getUserById } } });
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
    mocks.getUserById.mockResolvedValue({ data: { user: { id: "u1", email: "account@example.com" } }, error: null });
    mocks.ensureBetaAuthorAccess.mockResolvedValue({ ok: true });
    mocks.sendBetaWelcome.mockResolvedValue({ status: "sent", message: "Welcome email accepted." });
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
    expect(mocks.ensureBetaAuthorAccess).toHaveBeenCalledWith(mocks.createAdminClient.mock.results[0].value, "u1");
    expect(mocks.sendBetaWelcome).toHaveBeenCalledWith(mocks.createAdminClient.mock.results[0].value, {
      actorId: "admin-1", entityId: "u1", email: "account@example.com", name: undefined,
      accountExists: true, audience: "author",
    });
    expect(mocks.ensureBetaAuthorAccess.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendBetaWelcome.mock.invocationCallOrder[0]);
    expect(body.email).toEqual({ status: "sent", message: "Welcome email accepted." });
    expect(mocks.resendSend).not.toHaveBeenCalled();
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
    expect(mocks.resendSend).toHaveBeenCalledWith(expect.objectContaining({ to: "account@example.com" }));
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
    expect(mocks.ensureBetaAuthorAccess).not.toHaveBeenCalled();
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
    expect(mocks.ensureBetaAuthorAccess).toHaveBeenCalledWith(mocks.createAdminClient.mock.results[0].value, "u1");
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

  function setupApplication(options: { lookupError?: string; lookupThrows?: boolean; existing?: boolean } = {}) {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    buildFromMock({
      author_applications: {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: options.lookupThrows ? vi.fn().mockRejectedValue(new Error("lookup interrupted")) : vi.fn().mockResolvedValue({
          data: options.existing === false ? null : { user_id: "u1", first_name: "Anna", email: "editable@example.com" },
          error: options.lookupError ? { message: options.lookupError } : null,
        }) })) })),
        update,
        insert,
      },
      profiles: { update: vi.fn(() => ({ eq: vi.fn(() => ({ neq: vi.fn().mockResolvedValue({ error: null }) })) })) },
      audit_log: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
    return { update, insert };
  }

  it("fails closed when the application lookup fails", async () => {
    adminAllowed();
    const db = setupApplication({ lookupError: "lookup unavailable", existing: false });

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(500);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.ensureBetaAuthorAccess).not.toHaveBeenCalled();
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("does not write or notify %s when canonical email lookup fails", async (status) => {
    adminAllowed();
    const db = setupApplication();
    mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "auth unavailable" } });

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status }));

    expect(response.status).toBe(500);
    expect(mocks.getUserById).toHaveBeenCalledWith("u1");
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the application lookup throws", async () => {
    adminAllowed();
    const db = setupApplication({ lookupThrows: true });

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(500);
    expect((await response.json()).detail).toContain("No decision was saved or email sent");
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
  });

  it("does not notify when the canonical user has no email", async () => {
    adminAllowed();
    setupApplication();
    mocks.getUserById.mockResolvedValue({ data: { user: { id: "u1", email: null } }, error: null });

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(500);
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("does not send a welcome when author or beta access could not be enabled", async () => {
    adminAllowed();
    setupApplication();
    mocks.ensureBetaAuthorAccess.mockResolvedValue({ ok: false, error: "grant failed" });

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(500);
    expect((await response.json()).detail).toContain("No welcome email was sent");
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("fails closed when author access throws", async () => {
    adminAllowed();
    setupApplication();
    mocks.ensureBetaAuthorAccess.mockRejectedValue(new Error("access unavailable"));

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(500);
    expect(mocks.sendBetaWelcome).not.toHaveBeenCalled();
  });

  it.each(["already_sent", "retry", "daily_limit", "unavailable", "review_required"])("reports %s email status separately from approval", async (deliveryStatus) => {
    adminAllowed();
    setupApplication();
    const delivery = { status: deliveryStatus, message: "The welcome needs attention." };
    mocks.sendBetaWelcome.mockResolvedValue(delivery);

    const response = await PATCH(makeRequest("PATCH", { userId: "u1", status: "approved" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "approved", email: delivery });
    expect(mocks.sendBetaWelcome).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Anna", email: "account@example.com" }));
  });
});
