import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Admin-access guard for /admin/beta. The page is a client component and is
 * not directly responsible for auth — protection comes from /admin/layout.tsx
 * which calls `requireAdminPageAccess()` (covered by admin-page-auth.test.ts).
 *
 * These tests are structural: they fail if anyone deletes the layout, removes
 * the requireAdminPageAccess() call, or moves the beta page out from under
 * the /admin/ tree, all of which would silently un-gate the route.
 */

const here = dirname(fileURLToPath(import.meta.url));
const adminLayoutPath = resolve(here, "..", "layout.tsx");
const betaPagePath = resolve(here, "page.tsx");

describe("/admin/beta admin-access wiring", () => {
  it("the admin layout exists at the canonical path", () => {
    expect(existsSync(adminLayoutPath)).toBe(true);
  });

  it("the admin layout calls requireAdminPageAccess()", () => {
    const source = readFileSync(adminLayoutPath, "utf8");
    expect(source).toMatch(
      /import\s*{\s*requireAdminPageAccess\s*}\s*from\s*["']@\/lib\/admin-page-auth["']/
    );
    expect(source).toMatch(/await\s+requireAdminPageAccess\(\)/);
  });

  it("/admin/beta page lives under the protected admin tree", () => {
    expect(existsSync(betaPagePath)).toBe(true);
    // Path proves the route segment is /admin/beta — Next.js inherits the
    // nearest ancestor layout, which is /admin/layout.tsx.
    expect(betaPagePath).toMatch(/[\\/]admin[\\/]beta[\\/]page\.tsx$/);
  });

  it("/admin/beta page does not bypass the layout via its own route group or 'force-dynamic' redirect logic that skips auth", () => {
    const source = readFileSync(betaPagePath, "utf8");
    // No accidental "(public)" segment escape, no parallel auth skip flag.
    expect(source).not.toMatch(/\(public\)/);
    expect(source).not.toMatch(/skipAuth|bypassAuth/i);
  });

  it("/admin/beta page only fetches the funnel endpoint — never another admin route", () => {
    const source = readFileSync(betaPagePath, "utf8");
    const fetchTargets = Array.from(source.matchAll(/fetch\(\s*["']([^"']+)["']/g)).map(
      (m) => m[1]
    );
    expect(fetchTargets).toEqual(["/api/admin/metrics/funnel"]);
  });
});
