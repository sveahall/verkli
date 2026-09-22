import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import DeleteAccountSection from "./DeleteAccountSection";

describe("delete account section", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  /**
   * The endpoint records intent and signs the author out. It deletes nothing —
   * the teardown has to unwind Stripe, entitlements and payouts in order, and
   * the account row cascades to purchase history. So the copy may promise a
   * request a person acts on, and nothing stronger.
   */
  it("offers a request a person will act on, never an immediate deletion", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection requestedAt={null} />);
    expect(html).toContain("Request account deletion");
    expect(html).toContain("A person reviews it before anything is removed");
    expect(html).toContain("withdraw the request");
    expect(html).not.toMatch(/permanently delete|cannot be undone|deleted immediately/i);
  });

  it("does not put the destructive action one click away", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection requestedAt={null} />);
    // The confirm step is what actually posts; the first button only reveals it.
    expect(html).not.toContain("Send request and sign out");
  });

  it("shows a withdrawable pending state once a request exists", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection requestedAt="2026-09-22T10:00:00.000Z" />);
    expect(html).toContain("Deletion requested");
    expect(html).toContain("Nothing has been deleted yet");
    expect(html).toContain("Keep my account");
    expect(html).toContain("2026-09-22T10:00:00.000Z");
    // The request form is gone while one is pending, so it cannot be sent twice.
    expect(html).not.toContain("Request account deletion");
  });

});
