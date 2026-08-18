import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORT_MESSAGE_MAX,
  composeSupportMessage,
  isLikelyEmail,
  submitSupportRequest,
} from "./supportRequest";

const API_MESSAGE_MAX = 2000;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("isLikelyEmail", () => {
  it.each(["a@b.co", "reader.name+tag@example.com", "  spaced@example.org  "])(
    "accepts %s",
    (value) => {
      expect(isLikelyEmail(value)).toBe(true);
    }
  );

  it.each(["", "nope", "no@domain", "no@domain.c", "two @spaces.com"])(
    "rejects %s",
    (value) => {
      expect(isLikelyEmail(value)).toBe(false);
    }
  );
});

describe("composeSupportMessage", () => {
  it("returns the trimmed message when no reply address is given", () => {
    expect(composeSupportMessage({ message: "  my book is missing  " })).toBe(
      "my book is missing"
    );
  });

  it("returns empty string for a blank message so the caller can reject it", () => {
    expect(composeSupportMessage({ message: "   " })).toBe("");
  });

  it("appends the reply address behind an explicit label", () => {
    expect(
      composeSupportMessage({
        message: "cannot sign in",
        replyEmail: "reader@example.com",
      })
    ).toBe("cannot sign in\n\nReply to: reader@example.com");
  });

  it("ignores a blank reply address rather than appending an empty label", () => {
    expect(
      composeSupportMessage({ message: "cannot sign in", replyEmail: "   " })
    ).toBe("cannot sign in");
  });

  it("keeps the composed message inside the API cap even when the caller ignores SUPPORT_MESSAGE_MAX", () => {
    const composed = composeSupportMessage({
      message: "x".repeat(5000),
      replyEmail: "reader@example.com",
    });

    expect(composed.length).toBeLessThanOrEqual(API_MESSAGE_MAX);
    // The address is what makes a reply possible, so it must survive truncation.
    expect(composed.endsWith("Reply to: reader@example.com")).toBe(true);
  });

  it("leaves room for the reply line under the API cap at the textarea limit", () => {
    const composed = composeSupportMessage({
      message: "x".repeat(SUPPORT_MESSAGE_MAX),
      replyEmail: `${"a".repeat(100)}@example.com`,
    });

    expect(composed.length).toBeLessThanOrEqual(API_MESSAGE_MAX);
    expect(composed.startsWith("x".repeat(SUPPORT_MESSAGE_MAX))).toBe(true);
  });
});

describe("submitSupportRequest", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the topic, message and page url to the shared feedback route", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "abc" }));

    const result = await submitSupportRequest({
      topic: "bug",
      message: "chapter 3 will not open",
      pageUrl: "/support",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(init.method).toBe("POST");
    // Cookies must ride along or a signed-in reader's row loses its user_id.
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      type: "bug",
      message: "chapter 3 will not open",
      url: "/support",
    });
  });

  it("sends url as null rather than an empty string when no page is known", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "abc" }));

    await submitSupportRequest({ topic: "other", message: "a question" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).url).toBeNull();
  });

  it("rejects a malformed reply address without calling the API", async () => {
    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
      replyEmail: "not-an-email",
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank message without calling the API", async () => {
    const result = await submitSupportRequest({ topic: "bug", message: "   " });

    expect(result).toEqual({
      ok: false,
      message: "Write a message before sending.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API's error code as human copy", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "RATE_LIMIT_EXCEEDED" }, 429)
    );

    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
    });

    expect(result).toEqual({
      ok: false,
      message: "Too many requests. Please wait a moment.",
    });
  });

  it("falls back to actionable copy when the API sends an unknown error code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "WAT" }, 500));

    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The whole point of the page is a reachable human, so the failure copy
    // still has to name a way to reach one.
    expect(result.message).toContain("hello@verkli.com");
  });

  it("names the email fallback when the write itself fails", async () => {
    // The live `feedback` RLS policy currently rejects anonymous inserts, so
    // this is a path real readers hit — it must not dead-end on
    // "Failed to save feedback."
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "FEEDBACK_SAVE_FAILED" }, 500)
    );

    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("hello@verkli.com");
    expect(result.message).not.toContain("Failed to save feedback");
  });

  it("survives a non-JSON error body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
    });

    expect(result.ok).toBe(false);
  });

  it("reports a network failure instead of throwing at the form", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await submitSupportRequest({
      topic: "bug",
      message: "something broke",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("hello@verkli.com");
  });
});
