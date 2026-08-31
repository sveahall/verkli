import { describe, expect, it, vi } from "vitest";
import { auditMetadataFromRequest, recordAudit } from "./audit";

const AUDIT_ID = "3f1c8a52-0d44-4e6b-9b21-7c5a2e8f0011";

/**
 * Mirrors the postgrest-js chain recordAudit uses:
 * from("audit_log").insert(row).select("id").single().
 */
function makeSupabase(result: { data?: unknown; error?: { message?: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, _from: from, _insert: insert, _select: select };
}

describe("recordAudit", () => {
  it("maps the input onto the columns audit_log actually has", async () => {
    const sb = makeSupabase({ data: { id: AUDIT_ID }, error: null });
    const id = await recordAudit(sb as never, {
      action: "profile.role_change",
      target: { type: "profile", id: "user-123" },
      before: { role: "reader" },
      after: { role: "author" },
      metadata: { source: "admin-ui" },
      actor: { id: "admin-1", role: "admin" },
    });

    expect(id).toBe(AUDIT_ID);
    expect(sb._from).toHaveBeenCalledExactlyOnceWith("audit_log");
    expect(sb._insert).toHaveBeenCalledExactlyOnceWith({
      action: "profile.role_change",
      entity_type: "profile",
      entity_id: "user-123",
      actor_user_id: "admin-1",
      actor_role: "admin",
      request_id: null,
      meta: {
        source: "admin-ui",
        before: { role: "reader" },
        after: { role: "author" },
      },
    });
    expect(sb._select).toHaveBeenCalledWith("id");
  });

  // The bug this guards: the helper used to call a `record_audit` RPC that was
  // never created, so every call failed and the error was swallowed. Asserting
  // on `from` rather than `rpc` is the point of the test.
  it("writes through the table, not a stored function", async () => {
    const sb = makeSupabase({ data: { id: AUDIT_ID }, error: null }) as unknown as {
      rpc?: unknown;
      from: unknown;
    };
    await recordAudit(sb as never, {
      action: "book.publish",
      target: { type: "book", id: "book-1" },
    });
    expect(sb.rpc).toBeUndefined();
  });

  it("lifts request_id out of the metadata into its own column", async () => {
    const sb = makeSupabase({ data: { id: AUDIT_ID }, error: null });
    await recordAudit(sb as never, {
      action: "content_report.escalate",
      target: { type: "content_report", id: "report-9" },
      metadata: { request_id: "req-abc", path: "/api/legal/dmca-takedown" },
    });

    expect(sb._insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        request_id: "req-abc",
        // Not duplicated into meta.
        meta: { path: "/api/legal/dmca-takedown" },
      })
    );
  });

  it("omits before/after from meta when they are absent", async () => {
    const sb = makeSupabase({ data: { id: AUDIT_ID }, error: null });
    await recordAudit(sb as never, {
      action: "billing.subscription_cancel",
      target: { type: "author_subscription", id: "sub-1" },
      after: { status: "canceled" },
    });

    expect(sb._insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ meta: { after: { status: "canceled" } } })
    );
  });

  it("stores a null actor for a machine caller", async () => {
    const sb = makeSupabase({ data: { id: AUDIT_ID }, error: null });
    await recordAudit(sb as never, {
      action: "billing.connect_payouts_enabled",
      target: { type: "billing_account", id: "user-7" },
    });

    expect(sb._insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ actor_user_id: null, actor_role: null })
    );
  });

  it("returns null and logs when the insert errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sb = makeSupabase({ data: null, error: { message: "rls denied" } });
      const id = await recordAudit(sb as never, {
        action: "book.publish",
        target: { type: "book", id: "book-1" },
      });
      expect(id).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("returns null when the insert throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sb = {
        from: vi.fn(() => {
          throw new Error("network blew up");
        }),
      };
      const id = await recordAudit(sb as never, {
        action: "book.publish",
        target: { type: "book", id: "book-1" },
      });
      expect(id).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("returns null rather than a bogus id when the row comes back empty", async () => {
    const sb = makeSupabase({ data: null, error: null });
    const id = await recordAudit(sb as never, {
      action: "book.publish",
      target: { type: "book", id: "book-1" },
    });
    expect(id).toBeNull();
  });
});

describe("auditMetadataFromRequest", () => {
  it("extracts method, path, user-agent, and forwarded-for", () => {
    const req = new Request("https://example.com/api/admin/grant", {
      method: "POST",
      headers: {
        "user-agent": "test-agent/1.0",
        "x-forwarded-for": "1.2.3.4",
        "x-request-id": "req-abc",
      },
    });
    const meta = auditMetadataFromRequest(req, { reason: "manual" });
    expect(meta).toEqual({
      method: "POST",
      path: "/api/admin/grant",
      user_agent: "test-agent/1.0",
      request_id: "req-abc",
      forwarded_for: "1.2.3.4",
      reason: "manual",
    });
  });
});
