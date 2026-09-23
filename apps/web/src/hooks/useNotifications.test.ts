import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }]; },
  useRef: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = { current: initial }; return hooks.values[i]; },
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
}));
vi.mock("@/hooks/useDocumentVisible", () => ({ useDocumentVisible: () => true }));
import { useNotificationList } from "./useNotifications";
function RenderNotificationList() { return useNotificationList(1); }
function render() { hooks.cursor = 0; return RenderNotificationList(); }

describe("notification load recovery", () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; });
  afterEach(() => vi.unstubAllGlobals());
  it("reports HTTP errors and clears the error after a successful retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("Unavailable", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [{ id: "n-1" }], total: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    await render().refetch();
    expect(render()).toMatchObject({ loading: false, error: "Could not load notifications. Check your connection and try again." });
    await render().refetch();
    expect(render()).toMatchObject({ loading: false, error: null, notifications: [{ id: "n-1" }], total: 1 });
  });
});
