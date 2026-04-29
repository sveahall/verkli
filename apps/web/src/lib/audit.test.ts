import { describe, expect, it, vi } from "vitest";
import { auditMetadataFromRequest, recordAudit } from "./audit";

function makeSupabase(rpcResult: { data?: unknown; error?: { message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { rpc, _spy: rpc };
}

describe("recordAudit", () => {
  it("calls record_audit with the right payload for a profile.role_change", async () => {
    const sb = makeSupabase({ data: 42, error: null });
    const id = await recordAudit(sb, {
      action: "profile.role_change",
      target: { type: "profile", id: "user-123" },
      before: { role: "reader" },
      after: { role: "author" },
      metadata: { source: "admin-ui" },
      actor: { id: "admin-1", role: "admin" },
    });
    expect(id).toBe(42);
    expect(sb._spy).toHaveBeenCalledTimes(1);
    expect(sb._spy).toHaveBeenCalledWith("record_audit", {
      p_action: "profile.role_change",
      p_target_type: "profile",
      p_target_id: "user-123",
      p_before: { role: "reader" },
      p_after: { role: "author" },
      p_metadata: { source: "admin-ui" },
      p_actor_id: "admin-1",
      p_actor_role: "admin",
    });
  });

  it("propagates a billing.subscription_cancel call with null before-state", async () => {
    const sb = makeSupabase({ data: 7, error: null });
    await recordAudit(sb, {
      action: "billing.subscription_cancel",
      target: { type: "author_subscription", id: "sub-1" },
      after: { status: "canceled" },
    });
    expect(sb._spy).toHaveBeenCalledWith(
      "record_audit",
      expect.objectContaining({
        p_action: "billing.subscription_cancel",
        p_target_type: "author_subscription",
        p_before: null,
      })
    );
  });

  it("records content_report.resolve from a webhook actor", async () => {
    const sb = makeSupabase({ data: 1, error: null });
    await recordAudit(sb, {
      action: "content_report.resolve",
      target: { type: "content_report", id: "report-9" },
      actor: { id: null, role: "system" },
    });
    expect(sb._spy).toHaveBeenCalledWith(
      "record_audit",
      expect.objectContaining({
        p_action: "content_report.resolve",
        p_actor_id: null,
        p_actor_role: "system",
      })
    );
  });

  it("records admin.beta_grant", async () => {
    const sb = makeSupabase({ data: 2, error: null });
    const id = await recordAudit(sb, {
      action: "admin.beta_grant",
      target: { type: "admin_grant", id: "user-123" },
      after: { tier: "beta" },
    });
    expect(id).toBe(2);
  });

  it("returns null and logs when the rpc returns an error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sb = makeSupabase({ data: null, error: { message: "rls denied" } });
      const id = await recordAudit(sb, {
        action: "book.publish",
        target: { type: "book", id: "book-1" },
      });
      expect(id).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("returns null when the rpc throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sb = {
        rpc: vi.fn().mockRejectedValue(new Error("network blew up")),
      };
      const id = await recordAudit(sb, {
        action: "book.publish",
        target: { type: "book", id: "book-1" },
      });
      expect(id).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
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
