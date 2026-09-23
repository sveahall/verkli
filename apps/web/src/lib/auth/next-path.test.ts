import { describe, it, expect } from "vitest";
import {
  NEXT_PATH_COOKIE,
  defaultHomePathForRole,
  nextPathCookieHeader,
  readNextPathCookie,
  resolvePostSignInPath,
  sanitizeNextPath,
} from "@/lib/auth/next-path";

describe("sanitizeNextPath", () => {
  describe("accepts same-origin relative paths", () => {
    it("keeps the buy-path destination intact", () => {
      expect(sanitizeNextPath("/reader/books/abc-123")).toBe("/reader/books/abc-123");
    });

    it("preserves query and hash", () => {
      expect(sanitizeNextPath("/reader/books/1?ref=qr#chapter-2")).toBe(
        "/reader/books/1?ref=qr#chapter-2"
      );
    });

    it("trims surrounding whitespace", () => {
      expect(sanitizeNextPath("  /reader/library  ")).toBe("/reader/library");
    });

    it("normalises a bare root", () => {
      expect(sanitizeNextPath("/")).toBe("/");
    });

    it("allows author destinations", () => {
      expect(sanitizeNextPath("/author/books/9")).toBe("/author/books/9");
    });

    it("keeps a path segment that merely contains a colon", () => {
      expect(sanitizeNextPath("/reader/books/a:b")).toBe("/reader/books/a:b");
    });
  });

  describe("rejects open-redirect payloads", () => {
    // Each of these, if honoured, turns our sign-in page into a phishing
    // stepping stone: the victim starts on the real Verkli domain.
    const payloads: [string, string][] = [
      ["absolute https URL", "https://evil.com/harvest"],
      ["absolute http URL", "http://evil.com"],
      ["protocol-relative", "//evil.com"],
      ["protocol-relative with path", "//evil.com/reader/books/1"],
      ["backslash protocol-relative", "/\\evil.com"],
      ["mixed slash/backslash", "/\\/evil.com"],
      ["double backslash", "\\\\evil.com"],
      ["scheme without slashes", "javascript:alert(1)"],
      ["data URL", "data:text/html,<script>alert(1)</script>"],
      ["bare host", "evil.com/reader"],
      ["relative segment", "reader/books/1"],
      ["tab-smuggled protocol-relative", "/\t/evil.com"],
      ["newline-smuggled protocol-relative", "/\n/evil.com"],
      ["carriage-return smuggled", "/\r//evil.com"],
      ["NUL byte", "/reader\u0000/books"],
      ["encoded double slash", "/%2F%2Fevil.com"],
      ["encoded backslash", "/%5Cevil.com"],
      ["malformed percent escape", "/reader/%E0%A4%A"],
    ];

    for (const [label, payload] of payloads) {
      it(`rejects ${label}`, () => {
        expect(sanitizeNextPath(payload)).toBeNull();
      });
    }

    it("rejects an over-long value", () => {
      expect(sanitizeNextPath(`/reader/${"a".repeat(600)}`)).toBeNull();
    });
  });

  describe("rejects non-values", () => {
    it("rejects null", () => {
      expect(sanitizeNextPath(null)).toBeNull();
    });

    it("rejects undefined", () => {
      expect(sanitizeNextPath(undefined)).toBeNull();
    });

    it("rejects empty and whitespace-only", () => {
      expect(sanitizeNextPath("")).toBeNull();
      expect(sanitizeNextPath("   ")).toBeNull();
    });

    it("rejects non-strings", () => {
      expect(sanitizeNextPath(42 as unknown as string)).toBeNull();
    });
  });

  describe("rejects redirect loops back to auth screens", () => {
    const authPaths = [
      "/reader/signin",
      "/reader/signin?next=/reader/home",
      "/reader/signup",
      "/author/signin",
      "/reader/forgot-password",
      "/auth/callback",
    ];

    for (const path of authPaths) {
      it(`rejects ${path}`, () => {
        expect(sanitizeNextPath(path)).toBeNull();
      });
    }

    it("is case-insensitive about it", () => {
      expect(sanitizeNextPath("/Reader/SignIn")).toBeNull();
    });
  });
});

describe("resolvePostSignInPath", () => {
  it("honours a valid next over the role default", () => {
    expect(resolvePostSignInPath("/reader/books/1", "reader")).toBe("/reader/books/1");
  });

  it("sends an author to a reader book they were buying", () => {
    // An author who buys a colleague's book must land on the book, not the
    // author dashboard.
    expect(resolvePostSignInPath("/reader/books/1", "author")).toBe("/reader/books/1");
  });

  it("falls back to the role home when next is missing", () => {
    expect(resolvePostSignInPath(null, "reader")).toBe("/reader/home");
    expect(resolvePostSignInPath(null, "author")).toBe("/author/home");
    expect(resolvePostSignInPath(null, null)).toBe("/");
  });

  it("falls back to the role home when next is hostile", () => {
    expect(resolvePostSignInPath("//evil.com", "reader")).toBe("/reader/home");
    expect(resolvePostSignInPath("https://evil.com", "author")).toBe("/author/home");
  });
});

describe("defaultHomePathForRole", () => {
  it("maps each role", () => {
    expect(defaultHomePathForRole("reader")).toBe("/reader/home");
    expect(defaultHomePathForRole("author")).toBe("/author/home");
    expect(defaultHomePathForRole(null)).toBe("/");
  });
});

describe("next path carry cookie", () => {
  it("round-trips a path through the cookie", () => {
    const header = nextPathCookieHeader("/reader/books/1?ref=qr");
    expect(header).toContain(`${NEXT_PATH_COOKIE}=`);
    const value = header.split(";")[0].split("=").slice(1).join("=");
    expect(readNextPathCookie(`${NEXT_PATH_COOKIE}=${value}`)).toBe(
      "/reader/books/1?ref=qr"
    );
  });

  it("expires the cookie when clearing", () => {
    expect(nextPathCookieHeader(null)).toContain("Max-Age=0");
  });

  it("returns null when the cookie is absent", () => {
    expect(readNextPathCookie(null)).toBeNull();
    expect(readNextPathCookie("active_role=reader")).toBeNull();
  });

  it("re-validates the cookie value, so a tampered cookie is refused", () => {
    expect(
      readNextPathCookie(`${NEXT_PATH_COOKIE}=${encodeURIComponent("//evil.com")}`)
    ).toBeNull();
    expect(
      readNextPathCookie(`${NEXT_PATH_COOKIE}=${encodeURIComponent("https://evil.com")}`)
    ).toBeNull();
  });

  it("picks the right cookie out of a crowded header", () => {
    const header = `active_role=reader; ${NEXT_PATH_COOKIE}=${encodeURIComponent(
      "/reader/library"
    )}; sb-access-token=xyz`;
    expect(readNextPathCookie(header)).toBe("/reader/library");
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    expect(readNextPathCookie(`not_${NEXT_PATH_COOKIE}=/evil`)).toBeNull();
  });
});
