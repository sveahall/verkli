import { describe, expect, it } from "vitest";

import { resolveActiveRoleFromProfile } from "./active-role";

describe("resolveActiveRoleFromProfile", () => {
  it("returns null for null / undefined profile", () => {
    expect(resolveActiveRoleFromProfile(null)).toBeNull();
    expect(resolveActiveRoleFromProfile(undefined)).toBeNull();
  });

  it("prefers preferences.active_role over profiles.role", () => {
    expect(
      resolveActiveRoleFromProfile({
        role: "reader",
        preferences: { active_role: "author" },
      })
    ).toBe("author");
  });

  it("falls back to profiles.role when preferences is missing or empty", () => {
    expect(resolveActiveRoleFromProfile({ role: "author" })).toBe("author");
    expect(
      resolveActiveRoleFromProfile({ role: "reader", preferences: null })
    ).toBe("reader");
    expect(
      resolveActiveRoleFromProfile({ role: "author", preferences: {} })
    ).toBe("author");
  });

  it("falls back to profiles.role when preferences.active_role is invalid", () => {
    expect(
      resolveActiveRoleFromProfile({
        role: "reader",
        preferences: { active_role: "admin" },
      })
    ).toBe("reader");
  });

  it("returns null when both fields are missing or invalid", () => {
    expect(resolveActiveRoleFromProfile({})).toBeNull();
    expect(
      resolveActiveRoleFromProfile({ role: null, preferences: null })
    ).toBeNull();
    expect(
      resolveActiveRoleFromProfile({
        role: "bogus",
        preferences: { active_role: "also-bogus" },
      })
    ).toBeNull();
  });

  it("normalises case and whitespace from the DB (matches parseRole)", () => {
    expect(
      resolveActiveRoleFromProfile({
        role: "  AUTHOR  ",
        preferences: null,
      })
    ).toBe("author");
    expect(
      resolveActiveRoleFromProfile({
        role: null,
        preferences: { active_role: "Reader" },
      })
    ).toBe("reader");
  });

  it("ignores non-string preferences (defensive against malformed JSON)", () => {
    expect(
      resolveActiveRoleFromProfile({
        role: "author",
        preferences: "not-an-object" as unknown,
      })
    ).toBe("author");
    expect(
      resolveActiveRoleFromProfile({
        role: "reader",
        preferences: 42 as unknown,
      })
    ).toBe("reader");
  });
});
