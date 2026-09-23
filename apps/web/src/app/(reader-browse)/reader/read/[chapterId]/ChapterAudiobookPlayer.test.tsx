import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useMemo: (callback: () => unknown) => callback(),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock("./AudioTextSync", () => ({ useAudioTextSync: () => ({ update: () => {}, clear: () => {}, status: "waiting" }) }));
vi.mock("@/lib/flags", () => ({ getAudiobookEnabled: () => true }));
vi.mock("@/lib/analytics/useListenTracking", () => ({ useListenTracking: () => ({}) }));
import ChapterAudiobookPlayer from "./ChapterAudiobookPlayer";
function render() {
  hooks.cursor = 0;
  return renderToStaticMarkup(ChapterAudiobookPlayer({ bookId: "book", chapterId: "chapter", audiobookStatus: "ready" }));
}

describe("chapter playback failures", () => {
  beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [401, "UNAUTHORIZED", "Sign in again to listen to this chapter."],
    [403, "FORBIDDEN", "Your account does not have access to this audiobook. Open the book page to check your access."],
  ])("explains access denial %s without a false empty-audio state", async (status, error, copy) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status })));
    render();
    for (const effect of hooks.effects) effect();
    await vi.waitFor(() => expect(render()).toContain(copy));
    expect(render()).toContain('role="alert"');
    expect(render()).not.toContain("No audio is available");
  });
});
