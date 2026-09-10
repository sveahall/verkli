import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearBetaCache, grantBetaAccessIfInvited } from "./beta";

type ListResult = { data: Array<{ id: string }> | null; error: { message: string } | null };

/**
 * A Supabase double shaped like the two calls the function actually makes:
 * a filtered list against each waitlist table, and an upsert into user_flags.
 */
function makeSupabase(options: {
  waitlist?: ListResult;
  readerWaitlist?: ListResult;
  upsertError?: { message: string } | null;
}) {
  const empty: ListResult = { data: [], error: null };
  const upsert = vi.fn(async () => ({ error: options.upsertError ?? null }));
  const seen: string[] = [];

  const client = {
    from: vi.fn((table: string) => {
      seen.push(table);
      if (table === "user_flags") return { upsert };

      const result =
        table === "waitlist"
          ? options.waitlist ?? empty
          : options.readerWaitlist ?? empty;

      const chain = {
        select: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        not: vi.fn(() => chain),
        limit: vi.fn(async () => result),
      };
      return chain;
    }),
  };

  return { client: client as unknown as SupabaseClient, upsert, seen };
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
      { onConflict: "user_id" }
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
