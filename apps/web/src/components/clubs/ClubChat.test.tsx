import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }]; },
  useRef: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = { current: initial }; return hooks.values[i]; },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown) => { hooks.effects.push(fn); },
}));
vi.mock("@/hooks/useDocumentVisible", () => ({ useDocumentVisible: () => true }));
import ClubChat from "./ClubChat";
function render() { hooks.cursor = 0; return renderToStaticMarkup(ClubChat({ clubId: "club-1", currentUserId: "reader-1", initialMessages: [] })); }

describe("club chat recovery and accessibility", () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; });
  afterEach(() => vi.unstubAllGlobals());
  it("labels the composer and declares the actual scrolling conversation", () => {
    const html = render();
    expect(html).toContain('aria-label="Message"');
    expect(html).toContain('data-club-chat-scroll="true"');
    expect(html).toContain('role="log"');
  });
  it("reports unavailable updates and allows an explicit retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    render();
    const cleanup = hooks.effects.map((effect) => effect());
    try {
      await vi.waitFor(() => expect(render()).toContain("Try again"));
      expect(render()).toContain('role="alert"');
    } finally {
      for (const dispose of cleanup) if (typeof dispose === "function") dispose();
    }
  });
});
