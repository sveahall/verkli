import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateProviderImageUrl } from "./url-allowlist";

/**
 * Four routes forward user-writable URLs to an outbound video provider on the
 * strength of this one function, and nothing asserted its behaviour until now.
 *
 * The parser-differential block below is the important part. The guard reads
 * the host with WHATWG `new URL()`; a provider may parse the same bytes under
 * RFC 3986, where the authority runs to the first `/`, `?` or `#` and anything
 * before an `@` is userinfo. Those two disagree on inputs containing `\`, tabs
 * or newlines — which is why callers must forward `outcome.url.toString()` and
 * never the raw string they passed in.
 */

const SUPABASE_URL = "https://abcdefgh.supabase.co";
const ALLOWED = "abcdefgh.supabase.co";

const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalExtra = process.env.AI_IMAGE_URL_EXTRA_HOSTS;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  delete process.env.AI_IMAGE_URL_EXTRA_HOSTS;
});

afterEach(() => {
  if (originalSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
  if (originalExtra === undefined) delete process.env.AI_IMAGE_URL_EXTRA_HOSTS;
  else process.env.AI_IMAGE_URL_EXTRA_HOSTS = originalExtra;
});

describe("validateProviderImageUrl", () => {
  describe("parser differential — why callers must forward outcome.url", () => {
    // Backslash is the confusable one. WHATWG folds `\` to `/` for special
    // schemes, so the authority ends there and the host is the allow-listed
    // one — the guard says yes. An RFC-3986 parser does not fold it: the
    // authority runs to the first real `/`, making everything before the `@`
    // userinfo and `attacker.tld` the host. Forwarding `url.toString()` emits
    // the folded form, so both parsers then agree.
    it.each([
      `https://${ALLOWED}\\@attacker.tld/x.avif`,
      `https://${ALLOWED}\\\\@attacker.tld/x.avif`,
    ])("normalizes %j so the emitted url keeps the allow-listed host", (raw) => {
      const outcome = validateProviderImageUrl(raw);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.url.hostname).toBe(ALLOWED);
      // The emitted string is what callers must forward: re-parsing it cannot
      // land on the attacker host, and it is not the bytes we were handed.
      expect(new URL(outcome.url.toString()).hostname).toBe(ALLOWED);
      expect(outcome.url.toString()).not.toBe(raw);
      expect(outcome.url.toString()).not.toContain("\\");
    });

    // Tab, CR and LF are NOT part of that class, despite looking like it.
    // WHATWG strips them, which turns the `@` into a genuine userinfo
    // separator, so it reads the host as attacker.tld and the guard blocks.
    it.each([
      `https://${ALLOWED}\t@attacker.tld/x.avif`,
      `https://${ALLOWED}\n@attacker.tld/x.avif`,
      `https://${ALLOWED}\r@attacker.tld/x.avif`,
      // %2f is not folded either, so WHATWG agrees the host is attacker.tld.
      `https://${ALLOWED}%2f@attacker.tld/x.avif`,
    ])("blocks %j outright, because WHATWG reads the attacker host", (raw) => {
      expect(validateProviderImageUrl(raw)).toEqual({
        ok: false,
        reason: "blocked_host",
      });
    });
  });

  describe("scheme", () => {
    it("accepts https", () => {
      expect(validateProviderImageUrl(`${SUPABASE_URL}/a.png`).ok).toBe(true);
    });

    it.each(["http", "ftp", "file", "gopher", "data", "javascript"])(
      "rejects %s",
      (scheme) => {
        const candidate =
          scheme === "data"
            ? "data:image/png;base64,iVBORw0KGgo="
            : scheme === "javascript"
              ? "javascript:alert(1)"
              : `${scheme}://${ALLOWED}/a.png`;
        const outcome = validateProviderImageUrl(candidate);
        expect(outcome.ok).toBe(false);
      }
    );
  });

  describe("host allow-list", () => {
    it("accepts the Supabase storage host from the environment", () => {
      expect(validateProviderImageUrl(`${SUPABASE_URL}/storage/a.png`).ok).toBe(true);
    });

    it("accepts a subdomain of an allowed host", () => {
      expect(validateProviderImageUrl(`https://cdn.${ALLOWED}/a.png`).ok).toBe(true);
    });

    it("does not treat a suffix match as a subdomain match", () => {
      // The leading dot in `.${entry}` is what stops this. Without it,
      // `evil-abcdefgh.supabase.co` — a host an attacker can register — passes.
      expect(
        validateProviderImageUrl(`https://evil-${ALLOWED}/a.png`)
      ).toEqual({ ok: false, reason: "blocked_host" });
      expect(
        validateProviderImageUrl("https://abcdefgh.supabase.co.evil.tld/a.png")
      ).toEqual({ ok: false, reason: "blocked_host" });
    });

    it("rejects an unrelated host", () => {
      expect(validateProviderImageUrl("https://attacker.tld/a.png")).toEqual({
        ok: false,
        reason: "blocked_host",
      });
    });

    it("honours AI_IMAGE_URL_EXTRA_HOSTS, trimming and lowercasing entries", () => {
      process.env.AI_IMAGE_URL_EXTRA_HOSTS = " CDN.Example.COM , other.test ";
      expect(validateProviderImageUrl("https://cdn.example.com/a.png").ok).toBe(true);
      expect(validateProviderImageUrl("https://other.test/a.png").ok).toBe(true);
      expect(validateProviderImageUrl("https://third.test/a.png").ok).toBe(false);
    });

    it("blocks everything when no host is configured", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      expect(validateProviderImageUrl("https://anything.test/a.png")).toEqual({
        ok: false,
        reason: "blocked_host",
      });
    });
  });

  describe("private and metadata addresses", () => {
    it.each([
      "169.254.169.254",
      "127.0.0.1",
      "0.0.0.0",
      "localhost",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
    ])("blocks %s even before the allow-list", (host) => {
      process.env.AI_IMAGE_URL_EXTRA_HOSTS = host;
      expect(validateProviderImageUrl(`https://${host}/a.png`)).toEqual({
        ok: false,
        reason: "blocked_host",
      });
    });

    it("does not block 172.32.x, which is public", () => {
      process.env.AI_IMAGE_URL_EXTRA_HOSTS = "172.32.0.1";
      expect(validateProviderImageUrl("https://172.32.0.1/a.png").ok).toBe(true);
    });
  });

  describe("malformed input", () => {
    it.each([
      [undefined],
      [null],
      [42],
      [{}],
      [[]],
      [""],
      ["   "],
      ["not a url"],
      ["//abcdefgh.supabase.co/a.png"],
    ])("rejects %j without throwing", (candidate) => {
      const outcome = validateProviderImageUrl(candidate);
      expect(outcome.ok).toBe(false);
    });

    it("trims surrounding whitespace before parsing", () => {
      expect(validateProviderImageUrl(`  ${SUPABASE_URL}/a.png  `).ok).toBe(true);
    });
  });

  // Documents a real quirk rather than asserting it is desirable: the allowed
  // entry is built from `new URL(raw).host` (which keeps the port) while the
  // candidate is compared via `url.hostname` (which drops it). A Supabase URL
  // carrying a port therefore matches nothing. It fails CLOSED, so it is a
  // config footgun for local setups, not a security hole.
  it("fails closed when NEXT_PUBLIC_SUPABASE_URL carries a port", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co:8443";
    expect(validateProviderImageUrl("https://abcdefgh.supabase.co/a.png")).toEqual({
      ok: false,
      reason: "blocked_host",
    });
  });
});
