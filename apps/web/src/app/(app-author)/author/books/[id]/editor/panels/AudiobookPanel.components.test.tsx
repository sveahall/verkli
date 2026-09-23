import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise request lifecycle without adding a DOM test dependency.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0,
  effects: [] as { deps?: React.DependencyList; cleanup?: () => void }[], effectCursor: 0,
  pending: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
    const index = hooks.effectCursor++;
    const previous = hooks.effects[index];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) {
      hooks.pending.push(() => { previous?.cleanup?.(); hooks.effects[index] = { deps, cleanup: effect() || undefined }; });
    }
  },
}));
beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.effectCursor = 0; hooks.pending = []; });
afterEach(() => { hooks.effects.forEach((effect) => effect.cleanup?.()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

import { AudiobookCheckoutModal, AudiobookPreviewPlayer } from "./AudiobookPanel.components";

function buttons(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [ ...(element.type === "button" ? [element] : []), ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(buttons) ];
}

describe("Audiobook audio controls", () => {
  it("offers a sample instead of a playable empty timeline", () => {
    const html = renderToStaticMarkup(<AudiobookPreviewPlayer bookId="book" audioUrl={null} />);
    expect(html).toContain("Preview voice");
    expect(html).not.toContain("0:00 / 0:00");
    expect(html).not.toContain('aria-label="Play audio"');
  });

  it("labels playback, seeking and thirty-second skips for keyboard and assistive technology", () => {
    const html = renderToStaticMarkup(<AudiobookPreviewPlayer bookId="book" audioUrl="/sample.wav" />);
    for (const label of ["Play audio", "Back 30 seconds", "Forward 30 seconds", "Audio position", "Playback speed"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('type="range"');
  });
});

describe("Audiobook checkout", () => {
  it("keeps the dialog open while the existing async checkout handler reports its result", async () => {
    const onClose = vi.fn();
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    const onCheckout = vi.fn(() => pending);
    const tree = AudiobookCheckoutModal({ open: true, onClose, audiobookError: null, audiobookCheckoutLoading: false, onCheckout });
    const action = buttons(tree).find((button) => String(button.props.children).includes("checkout") || String(button.props.children).includes("Generate full"));
    expect(action).toBeDefined();
    (action!.props.onClick as () => void)();
    expect(onCheckout).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    settle();
    await pending;
    expect(onClose).not.toHaveBeenCalled();
  });

  it("exposes a checkout failure as an alert while preserving the retry action", () => {
    const html = renderToStaticMarkup(<AudiobookCheckoutModal open onClose={() => {}} audiobookError="Nothing was charged. Try again." audiobookCheckoutLoading={false} onCheckout={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nothing was charged. Try again.");
  });
});

function renderPlayer(overrides: Partial<React.ComponentProps<typeof AudiobookPreviewPlayer>> = {}) {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  const tree = AudiobookPreviewPlayer({ bookId: "book", versionId: "english", audioUrl: null, ...overrides });
  hooks.pending.splice(0).forEach((effect) => effect());
  return tree;
}
function startPreview(tree: React.ReactNode) {
  const button = buttons(tree).find((item) => String(item.props.children).includes("Preview voice"));
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("selected edition voice preview lifecycle", () => {
  it("posts the selected edition and revokes its audio when the edition changes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(["audio"])));
    vi.stubGlobal("fetch", fetch);
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:english");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    startPreview(renderPlayer());
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ versionId: "english" });
    await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
    expect(renderToStaticMarkup(renderPlayer())).toContain("blob:english");
    renderPlayer({ versionId: "swedish" });
    expect(renderToStaticMarkup(renderPlayer({ versionId: "swedish" }))).not.toContain("blob:english");
    expect(revoke).toHaveBeenCalledWith("blob:english");
  });

  it.each([{ versionId: "swedish" }, { bookId: "other-book" }])("ignores a late success after selection changes: %j", async (selection) => {
    const response = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetch);
    const createUrl = vi.spyOn(URL, "createObjectURL");
    startPreview(renderPlayer());
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    renderPlayer(selection);
    response.resolve(new Response(new Blob(["old audio"])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signal.aborted).toBe(true);
    expect(createUrl).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(renderPlayer(selection))).toContain("Preview voice");
  });

  it("ignores an error body that finishes after unmount", async () => {
    const body = deferred<{ detail: string }>();
    const json = vi.fn(() => body.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json }));
    startPreview(renderPlayer());
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    hooks.effects.forEach((effect) => effect.cleanup?.());
    body.resolve({ detail: "Old edition error" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hooks.values).not.toContain("Old edition error");
  });

  it("ignores a blob that finishes after unmount", async () => {
    const body = deferred<Blob>();
    const blob = vi.fn(() => body.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob }));
    const createUrl = vi.spyOn(URL, "createObjectURL");
    startPreview(renderPlayer());
    await vi.waitFor(() => expect(blob).toHaveBeenCalledOnce());
    hooks.effects.forEach((effect) => effect.cleanup?.());
    body.resolve(new Blob(["old audio"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createUrl).not.toHaveBeenCalled();
  });
});
