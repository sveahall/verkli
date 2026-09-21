import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { getConfirmedEmail } from "./verified-email";

function user(patch: Partial<User>): User {
  return { id: "u1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "", ...patch } as User;
}

describe("getConfirmedEmail", () => {
  it("returns the address once Supabase has confirmed it", () => {
    expect(
      getConfirmedEmail(
        user({ email: "a@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" })
      )
    ).toBe("a@example.com");
  });

  it("does not treat phone confirmation as email confirmation", () => {
    expect(
      getConfirmedEmail(user({ email: "a@example.com", phone_confirmed_at: "2026-01-01T00:00:00Z", confirmed_at: "2026-01-01T00:00:00Z" }))
    ).toBeNull();
  });

  // The whole point: an unconfirmed address is a claim. Returning it would let
  // it act as a lookup key for someone else's Stripe customer.
  it("returns null for an unconfirmed address", () => {
    expect(getConfirmedEmail(user({ email: "victim@example.com" }))).toBeNull();
  });

  it("returns null when there is no address, even if confirmed", () => {
    expect(
      getConfirmedEmail(user({ email: undefined, email_confirmed_at: "2026-01-01T00:00:00Z" }))
    ).toBeNull();
    expect(
      getConfirmedEmail(user({ email: "   ", email_confirmed_at: "2026-01-01T00:00:00Z" }))
    ).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(
      getConfirmedEmail(
        user({ email: "  a@example.com  ", email_confirmed_at: "2026-01-01T00:00:00Z" })
      )
    ).toBe("a@example.com");
  });

  it("returns null for no user at all", () => {
    expect(getConfirmedEmail(null)).toBeNull();
    expect(getConfirmedEmail(undefined)).toBeNull();
  });
});
