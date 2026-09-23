import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ changes: vi.fn(), values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: (initial: unknown) => { const i = state.cursor++; if (!(i in state.values)) state.values[i] = initial; return [state.values[i], (value: unknown) => { state.values[i] = value; state.changes(value); }]; }, useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() }));
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
import NewsletterComposer from "./NewsletterComposer";

type Node = ReactElement<{ children?: unknown; onClick?: () => Promise<void> }>;
function button(node: unknown, label: string): Node | undefined {
  if (Array.isArray(node)) return node.map((child) => button(child, label)).find(Boolean);
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const element = node as Node;
  return element.props.children === label ? element : button(element.props.children, label);
}

describe("newsletter composer send guard", () => {
  beforeEach(() => { state.values = []; state.cursor = 0; vi.clearAllMocks(); vi.stubGlobal("confirm", () => true); });
  afterEach(() => vi.unstubAllGlobals());
  it("does not send stale content when saving the draft fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "VALIDATION_FAILED" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const onSent = vi.fn();
    const tree = NewsletterComposer({ newsletter: { id: "draft-1", subject: "News", body_html: "<p>Hello</p>", body_text: "Hello", status: "draft" }, onSent });
    await button(tree, "Send newsletter")!.props.onClick!();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(onSent).not.toHaveBeenCalled();
  });
  it("warns about uncertain delivery instead of recommending a blind resend", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "NEWSLETTER_SEND_FAILED" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const tree = NewsletterComposer({ newsletter: { id: "draft-1", subject: "News", body_html: "<p>Hello</p>", body_text: "Hello", status: "draft" } });
    await button(tree, "Send newsletter")!.props.onClick!();
    expect(state.changes).toHaveBeenCalledWith(expect.stringContaining("Check delivery status before sending again"));
  });

  it("locks the composer after a successful send without requiring a page reload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipientCount: 2 }))));
    const props = { newsletter: { id: "draft-1", subject: "News", body_html: "<p>Hello</p>", body_text: "Hello", status: "draft" } };
    const tree = NewsletterComposer(props);
    await button(tree, "Send newsletter")!.props.onClick!();
    state.cursor = 0;
    expect(button(NewsletterComposer(props), "Send newsletter")).toBeUndefined();
  });

});
