import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (action: unknown, initial: unknown) => {
    harness.dispatch = action as typeof harness.dispatch;
    return [initial, vi.fn(), false];
  },
}));

import AccountEmailSection from "./AccountEmailSection";

function form(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

/** Reach the fetch-backed action the component hands to useActionState. */
async function submit(email: string) {
  renderToStaticMarkup(<AccountEmailSection currentEmail="old@example.test" />);
  return (await harness.dispatch({ ok: false, message: "" }, form(email))) as { ok: boolean; message: string };
}

describe("account email change", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.restoreAllMocks());

  it("keeps showing the address that still works until the new one is confirmed", () => {
    const html = renderToStaticMarkup(<AccountEmailSection currentEmail="old@example.test" />);
    expect(html).toContain("old@example.test");
    expect(html).toContain("until you confirm the new address");
  });

  /**
   * Supabase only moves the account once the new address is confirmed, so a
   * plain "Email changed" would have authors trying to sign in with an address
   * that does not work yet.
   */
  it("reports a pending confirmation, never a completed change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, pendingConfirmation: true })));
    const result = await submit("new@example.test");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Confirm from both addresses");
    expect(result.message).toContain("new@example.test");
    expect(result.message).not.toMatch(/changed|updated|saved/i);
  });

  it("treats re-saving the same address as a no-op rather than a pending change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, unchanged: true })));
    expect(await submit("old@example.test")).toEqual({ ok: true, message: "That is already your sign-in email." });
  });

  it("surfaces the API's own reason, including the rate limit this route enforces", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 })));
    const limited = await submit("new@example.test");
    expect(limited.ok).toBe(false);
    expect(limited.message).not.toBe("");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const offline = await submit("new@example.test");
    expect(offline.ok).toBe(false);
    expect(offline.message).toContain("connection");
  });

  it("does not call the API for an empty address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await submit("   ")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
