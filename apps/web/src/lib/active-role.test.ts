import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getActiveRoleFromRequest,
  getActiveRoleFromCookieValue,
  getActiveRoleFromCookies,
  isValidActiveRole,
  activeRoleCookieHeader,
  ACTIVE_ROLE_COOKIE,
} from "@/lib/active-role";

describe("active-role", () => {
  describe("getActiveRoleFromRequest", () => {
    it("returns reader when cookie is reader", () => {
      const req = new Request("https://example.com", {
        headers: { cookie: `${ACTIVE_ROLE_COOKIE}=reader` },
      });
      expect(getActiveRoleFromRequest(req)).toBe("reader");
    });

    it("returns author when cookie is author", () => {
      const req = new Request("https://example.com", {
        headers: { cookie: `${ACTIVE_ROLE_COOKIE}=author` },
      });
      expect(getActiveRoleFromRequest(req)).toBe("author");
    });

    it("returns null when cookie is missing", () => {
      const req = new Request("https://example.com");
      expect(getActiveRoleFromRequest(req)).toBeNull();
    });

    it("returns null when cookie has invalid value", () => {
      const req = new Request("https://example.com", {
        headers: { cookie: `${ACTIVE_ROLE_COOKIE}=admin` },
      });
      expect(getActiveRoleFromRequest(req)).toBeNull();
    });
  });

  describe("getActiveRoleFromCookieValue", () => {
    it("returns reader for reader", () => {
      expect(getActiveRoleFromCookieValue("reader")).toBe("reader");
    });
    it("returns author for author", () => {
      expect(getActiveRoleFromCookieValue("author")).toBe("author");
    });
    it("returns null for invalid or empty", () => {
      expect(getActiveRoleFromCookieValue("")).toBeNull();
      expect(getActiveRoleFromCookieValue(undefined)).toBeNull();
      expect(getActiveRoleFromCookieValue("other")).toBeNull();
    });
  });

  describe("getActiveRoleFromCookies", () => {
    const originalDocument = global.document;

    beforeEach(() => {
      Object.defineProperty(global, "document", {
        value: { cookie: "" },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, "document", {
        value: originalDocument,
        writable: true,
      });
    });

    it("returns reader when document.cookie has active_role=reader", () => {
      (global.document as { cookie: string }).cookie = `${ACTIVE_ROLE_COOKIE}=reader`;
      expect(getActiveRoleFromCookies()).toBe("reader");
    });

    it("returns author when document.cookie has active_role=author", () => {
      (global.document as { cookie: string }).cookie = `${ACTIVE_ROLE_COOKIE}=author`;
      expect(getActiveRoleFromCookies()).toBe("author");
    });
  });

  describe("isValidActiveRole", () => {
    it("accepts reader and author", () => {
      expect(isValidActiveRole("reader")).toBe(true);
      expect(isValidActiveRole("author")).toBe(true);
    });
    it("rejects other values", () => {
      expect(isValidActiveRole("admin")).toBe(false);
      expect(isValidActiveRole("")).toBe(false);
    });
  });

  describe("activeRoleCookieHeader", () => {
    it("produces Set-Cookie value for reader", () => {
      const h = activeRoleCookieHeader("reader");
      expect(h).toContain("active_role=reader");
      expect(h).toContain("Path=/");
    });
    it("produces Set-Cookie value for author", () => {
      const h = activeRoleCookieHeader("author");
      expect(h).toContain("active_role=author");
    });
  });
});
