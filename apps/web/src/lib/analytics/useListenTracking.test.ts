import type { SyntheticEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
import { useListenTracking } from "./useListenTracking";

function ListenTrackingHarness(resumePositionSeconds: number | null = null) {
  const handlers = useListenTracking({ bookId: "book", chapterId: "chapter", enabled: true, resumePositionSeconds });
  const cleanups = hooks.effects.map((effect) => effect());
  const media = { currentTime: 0, duration: 600 };
  const event = { currentTarget: media } as SyntheticEvent<HTMLAudioElement>;
  return { handlers, media, event, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

describe("listening position lifecycle", () => {
  beforeEach(() => {
    hooks.effects = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(false) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true,"saved":true}')));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("does not overwrite a newer position with an old debounced seek", async () => {
    const { handlers, media, event } = ListenTrackingHarness();
    handlers.onLoadedMetadata(event);
    media.currentTime = 100;
    handlers.onSeeked(event);
    media.currentTime = 101;
    handlers.onTimeUpdate(event);
    await vi.advanceTimersByTimeAsync(2001);
    const positions = vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string).positionSeconds);
    expect(positions).toEqual([101]);
  });

  it("flushes a rewind to zero before the pause debounce on chapter unmount", async () => {
    const { handlers, media, event, unmount } = ListenTrackingHarness(120);
    handlers.onLoadedMetadata(event);
    expect(media.currentTime).toBe(120);
    media.currentTime = 0;
    handlers.onSeeked(event);
    unmount();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ chapterId: "chapter", positionSeconds: 0 });
  });

  it("restores once and preserves a deliberate rewind on later metadata events", () => {
    const { handlers, media, event } = ListenTrackingHarness(120);
    handlers.onLoadedMetadata(event);
    expect(media.currentTime).toBe(120);
    media.currentTime = 20;
    handlers.onLoadedMetadata(event);
    expect(media.currentTime).toBe(20);
  });

  it("cancels an older seek when the reader returns to the saved position", async () => {
    const { handlers, media, event } = ListenTrackingHarness(120);
    handlers.onLoadedMetadata(event);
    media.currentTime = 100;
    handlers.onSeeked(event);
    media.currentTime = 120;
    handlers.onSeeked(event);
    await vi.advanceTimersByTimeAsync(2001);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("queues chapter navigation behind an in-flight write instead of racing a beacon", async () => {
    let finish: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { handlers, media, event, unmount } = ListenTrackingHarness();
    media.currentTime = 80;
    handlers.onTimeUpdate(event);
    await vi.advanceTimersByTimeAsync(1);
    media.currentTime = 20;
    handlers.onSeeked(event);
    unmount();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(new Response('{"ok":true,"saved":true}'));
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string).positionSeconds)).toEqual([80, 20]);
  });
});
