import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => { hooks.effects.push(fn); },
}));
import PollCard from "./PollCard";
const props = { pollId: "poll-1", question: "Next book?", options: [{ id: "a", text: "Book A", sort_order: 0 }], isActive: true, closesAt: null, userVoteOptionId: "a" };
function render() { hooks.cursor = 0; return renderToStaticMarkup(PollCard(props)); }

describe("poll result recovery", () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; });
  afterEach(() => vi.unstubAllGlobals());
  it("does not offer another vote while a recorded vote's results are loading", () => {
    const html = render();
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("Loading results");
  });
  it("offers retry when results fail without reopening voting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    render();
    for (const effect of hooks.effects) effect();
    await vi.waitFor(() => expect(render()).toContain("Try again"));
    expect(render()).not.toContain('type="radio"');
    expect(render()).toContain('role="alert"');
  });
});
