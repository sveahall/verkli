import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearBetaCache, grantBetaAccessIfInvited, ensureBetaAuthorAccess } from "./beta";

type ListResult = { data: Array<{ id: string; email?: string }> | null; error: { message: string } | null };

function makeSupabase(options: {
  waitlist?: ListResult;
  readerWaitlist?: ListResult;
  upsertError?: { message: string } | null;
  flag?: { beta_enabled: boolean } | null;
  flagReadError?: { message: string } | null;
  profile?: { user_id: string; role: string } | null;
  profileReadError?: { message: string } | null;
  profileWriteError?: { message: string } | null;
  profileUpdateMissing?: boolean;
  applicationError?: { message: string } | null;
  revokeBeforeClaim?: boolean;
}) {
  const empty: ListResult = { data: [], error: null };
  let flag = options.flag ?? null;
  let profile = options.profile === undefined ? { user_id: "user-1", role: "reader" } : options.profile;
  const upsert = vi.fn(async (value: { beta_enabled: boolean }, settings?: { ignoreDuplicates?: boolean }) => {
    if (options.revokeBeforeClaim) flag = { beta_enabled: false };
    if (!options.upsertError && !(settings?.ignoreDuplicates && flag)) flag = value;
    return { error: options.upsertError ?? null };
  });
  const applicationUpsert = vi.fn(async () => ({ error: options.applicationError ?? null }));
  const profileUpdate = vi.fn((value: { role: string }) => {
    const result = {
      eq: vi.fn(() => result),
      select: vi.fn(() => result),
      maybeSingle: vi.fn(async () => {
        if (options.profileWriteError) return { data: null, error: options.profileWriteError };
        if (options.profileUpdateMissing || !profile) return { data: null, error: null };
        profile = { ...profile, role: value.role };
        return { data: profile, error: null };
      }),
    };
    return result;
  });
  const seen: string[] = [];
  const patterns: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      seen.push(table);
      if (table === "author_applications") return { upsert: applicationUpsert };
      if (table === "profiles") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: profile, error: options.profileReadError ?? null })),
          update: profileUpdate,
        };
        return chain;
      }
      if (table === "user_flags") {
        const chain = {
          upsert,
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: flag, error: options.flagReadError ?? null })),
        };
        return chain;
      }
      const result = table === "waitlist" ? options.waitlist ?? empty : options.readerWaitlist ?? empty;
      let matchedEmail = "";
      const chain = {
        select: vi.fn(() => chain),
        ilike: vi.fn((_column: string, pattern: string) => {
          patterns.push(pattern);
          matchedEmail = pattern.replace(/\\([\\%_])/g, "$1");
          return chain;
        }),
        not: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          ...result,
          data: result.data?.map((row) => ({ ...row, email: row.email ?? matchedEmail })) ?? null,
        })),
      };
      return chain;
    }),
  };
  return { client: client as unknown as SupabaseClient, upsert, seen, patterns, applicationUpsert, profileUpdate };
}

const invited: ListResult = { data: [{ id: "row-1" }], error: null };

describe("grantBetaAccessIfInvited", () => {
  const original = process.env.BETA_AUTOGRANT_FROM_WAITLIST;

  beforeEach(() => {
    clearBetaCache();
    delete process.env.BETA_AUTOGRANT_FROM_WAITLIST;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BETA_AUTOGRANT_FROM_WAITLIST;
    else process.env.BETA_AUTOGRANT_FROM_WAITLIST = original;
  });

  it("grants when the address was invited on the author waitlist", async () => {
    const { client, upsert } = makeSupabase({ waitlist: invited });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-1",
      email: "author@example.com",
    });

    expect(result).toEqual({ granted: true });
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", beta_enabled: true },
      expect.objectContaining({ onConflict: "user_id" })
    );
  });

  it("grants when the address was invited on the reader waitlist", async () => {
    const { client, upsert } = makeSupabase({ readerWaitlist: invited });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-2",
      email: "reader@example.com",
    });

    expect(result).toEqual({ granted: true });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("does not grant to an address that is on a list but was never invited", async () => {
    // The waitlist form is public. Membership alone must not open BETA_LOCK,
    // or anyone could fill in the form and walk through it.
    const { client, upsert } = makeSupabase({});

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-3",
      email: "stranger@example.com",
    });

    expect(result).toEqual({ granted: false, reason: "not_invited" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("matches the address case-insensitively and ignores surrounding space", async () => {
    const { client } = makeSupabase({ waitlist: invited });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-4",
      email: "  Author@Example.COM ",
    });

    expect(result).toEqual({ granted: true });
  });

  it("reports a failed lookup as an error rather than as 'not invited'", async () => {
    // Reporting a broken lookup as a "no" would strand an invited tester
    // outside the lock with nothing in the logs to say why.
    const { client, upsert } = makeSupabase({
      waitlist: { data: null, error: { message: "connection reset" } },
    });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-5",
      email: "author@example.com",
    });

    expect(result).toEqual({
      granted: false,
      reason: "error",
      error: "connection reset",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("reports a failed upsert as an error", async () => {
    const { client } = makeSupabase({
      waitlist: invited,
      upsertError: { message: "permission denied for table user_flags" },
    });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-6",
      email: "author@example.com",
    });

    expect(result).toEqual({
      granted: false,
      reason: "error",
      error: "permission denied for table user_flags",
    });
  });

  it("does nothing without an email address", async () => {
    const { client, seen } = makeSupabase({ waitlist: invited });

    const result = await grantBetaAccessIfInvited(client, {
      userId: "user-7",
      email: null,
    });

    expect(result).toEqual({ granted: false, reason: "no_email" });
    expect(seen).toEqual([]);
  });

  it("is on when the env var is unset, and only 'false' turns it off", async () => {
    // Default-on is deliberate: a feature that is silently off because an env
    // var is missing is the failure this codebase keeps repeating.
    const unset = makeSupabase({ waitlist: invited });
    expect(
      await grantBetaAccessIfInvited(unset.client, { userId: "u", email: "a@b.com" })
    ).toEqual({ granted: true });

    process.env.BETA_AUTOGRANT_FROM_WAITLIST = "true";
    const on = makeSupabase({ waitlist: invited });
    expect(
      await grantBetaAccessIfInvited(on.client, { userId: "u", email: "a@b.com" })
    ).toEqual({ granted: true });

    process.env.BETA_AUTOGRANT_FROM_WAITLIST = "false";
    const off = makeSupabase({ waitlist: invited });
    expect(
      await grantBetaAccessIfInvited(off.client, { userId: "u", email: "a@b.com" })
    ).toEqual({ granted: false, reason: "disabled" });
    expect(off.seen).toEqual([]);
  });
});


describe("beta invitation access boundaries", () => {
  beforeEach(() => { clearBetaCache(); });

  it("prepares approved author access before granting an author invitation", async () => {
    const db = makeSupabase({ waitlist: invited });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "user-1", email: "a@example.com" })).toEqual({ granted: true });
    expect(db.applicationUpsert).toHaveBeenCalledWith({ user_id: "user-1", status: "approved" }, { onConflict: "user_id" });
    expect(db.profileUpdate).toHaveBeenCalledWith({ role: "author" });
    expect(db.applicationUpsert.mock.invocationCallOrder[0]).toBeLessThan(db.upsert.mock.invocationCallOrder[0]);
    expect(db.profileUpdate.mock.invocationCallOrder[0]).toBeLessThan(db.upsert.mock.invocationCallOrder[0]);
  });

  it("does not grant author privileges to a reader invitation", async () => {
    const db = makeSupabase({ readerWaitlist: invited });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "reader-1", email: "reader@example.com" })).toEqual({ granted: true });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.profileUpdate).not.toHaveBeenCalled();
  });

  it("escapes wildcard characters so one mailbox cannot match another invite", async () => {
    const db = makeSupabase({});
    await grantBetaAccessIfInvited(db.client, { userId: "u", email: "  A_%x@example.com " });
    expect(db.patterns).toEqual(["a\\_\\%x@example.com", "a\\_\\%x@example.com"]);
  });

  it("requires the returned mailbox itself to match even if the provider broadens a pattern", async () => {
    const db = makeSupabase({ waitlist: { data: [{ id: "other", email: "victim@example.com" }], error: null } });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "u", email: "*@example.com" })).toEqual({ granted: false, reason: "not_invited" });
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.applicationUpsert).not.toHaveBeenCalled();
  });

  it("keeps a revoked user outside beta despite an old invitation", async () => {
    const db = makeSupabase({ waitlist: invited, flag: { beta_enabled: false } });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "u", email: "a@example.com" })).toEqual({ granted: false, reason: "revoked" });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("does not overwrite a revoke that races the initial callback lookup", async () => {
    const db = makeSupabase({ readerWaitlist: invited, revokeBeforeClaim: true });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "u", email: "a@example.com" })).toEqual({ granted: false, reason: "revoked" });
  });

  it("does not approve an old author invitation again for an existing beta member", async () => {
    const db = makeSupabase({ waitlist: invited, flag: { beta_enabled: true } });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "u", email: "a@example.com" })).toEqual({ granted: true });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.profileUpdate).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("fails closed when the persisted revoke state cannot be read", async () => {
    const db = makeSupabase({ waitlist: invited, flagReadError: { message: "read failed" } });
    expect(await grantBetaAccessIfInvited(db.client, { userId: "u", email: "a@example.com" })).toEqual({ granted: false, reason: "error", error: "read failed" });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});

describe("ensureBetaAuthorAccess", () => {
  it("preserves an administrator's role", async () => {
    const db = makeSupabase({ profile: { user_id: "admin-1", role: "admin" } });
    expect(await ensureBetaAuthorAccess(db.client, "admin-1")).toEqual({ ok: true });
    expect(db.profileUpdate).not.toHaveBeenCalled();
    expect(db.applicationUpsert).toHaveBeenCalledOnce();
    expect(db.upsert).toHaveBeenCalledOnce();
  });

  it("fails rather than claim access when a profile is missing", async () => {
    const db = makeSupabase({ profile: null });
    expect(await ensureBetaAuthorAccess(db.client, "missing")).toEqual({ ok: false, error: "Author profile is missing. Retry after account setup completes." });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("does not grant beta after an application write error", async () => {
    const db = makeSupabase({ applicationError: { message: "application failed" } });
    expect(await ensureBetaAuthorAccess(db.client, "u")).toEqual({ ok: false, error: "application failed" });
    expect(db.profileUpdate).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("does not grant beta when the profile update affects no row", async () => {
    const db = makeSupabase({ profileUpdateMissing: true });
    expect(await ensureBetaAuthorAccess(db.client, "u")).toEqual({ ok: false, error: "Author role changed during approval. Reload and retry." });
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("fails closed when profile lookup fails", async () => {
    const db = makeSupabase({ profileReadError: { message: "profile failed" } });
    expect(await ensureBetaAuthorAccess(db.client, "u")).toEqual({ ok: false, error: "profile failed" });
    expect(db.applicationUpsert).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
