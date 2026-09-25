import type { ComponentProps, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/author-workspaces/WorkspaceLayout", () => ({ default: "layout" }));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: "actions" }));
import { PostDrawer } from "./CampaignDetailView";

type Props = ComponentProps<typeof PostDrawer>;
type Node = ReactElement<{
  children?: unknown; id?: string; disabled?: boolean; value?: string;
  onClick?: () => Promise<void> | void;
  onChange?: (event: { target: { value: string } }) => void;
}>;
function find(node: unknown, match: (element: Node) => boolean): Node | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const element = node as Node;
  return match(element) ? element : find(element.props.children, match);
}
const button = (tree: unknown, label: string) => find(tree, (node) => node.props.children === label)!;
const field = (tree: unknown, id: string) => find(tree, (node) => node.props.id === id)!;
const revisionA = "2026-09-16T10:00:00.123456+00:00";
const revisionB = "2026-09-16T10:00:01.123456+00:00";
const post: Props["post"] = {
  id: "post-a", scheduledFor: "2026-09-16T10:00:00Z", channel: "x", language: "en",
  contentType: "text", status: "ready", headline: null, caption: "Caption A", hashtags: "#A",
  cta: null, shareUrl: null, mediaAssetId: null, mediaAssetUrl: null, assetError: null,
  postedAt: null, postedUrl: null, mode: "manual", updatedAt: revisionA,
};
let props: Props;
function render() { state.cursor = 0; return PostDrawer(props); }

beforeEach(() => {
  state.values = []; state.cursor = 0; vi.useFakeTimers();
  props = { post, onClose: vi.fn(), onUpdate: vi.fn().mockResolvedValue({ updatedAt: revisionB }),
    onReload: vi.fn().mockResolvedValue({ ...post, caption: "Caption B", hashtags: "#B", updatedAt: revisionB }),
    onGenerateTrailer: vi.fn() };
});
afterEach(() => { vi.useRealTimers(); });

describe("post review revision", () => {
  it.each(["Save edits", "Mark as posted", "Skip this one"])("sends the displayed revision for %s", async (action) => {
    await button(render(), action).props.onClick!();
    expect(props.onUpdate).toHaveBeenCalledWith(post.id, expect.objectContaining({ expectedUpdatedAt: revisionA }));
  });

  it("keeps revision A paired with draft A when a parent refresh brings revision B", async () => {
    field(render(), "post-caption").props.onChange!({ target: { value: "My local edits" } });
    props = { ...props, post: { ...post, caption: "Caption B", updatedAt: revisionB } };
    await button(render(), "Approve final copy").props.onClick!();
    expect(props.onUpdate).toHaveBeenCalledWith(post.id, {
      caption: "My local edits", hashtags: "#A", status: "ready", expectedUpdatedAt: revisionA,
    });
  });

  it("advances the revision only after a successful own save", async () => {
    await button(render(), "Save edits").props.onClick!();
    await button(render(), "Mark as posted").props.onClick!();
    expect(props.onUpdate).toHaveBeenLastCalledWith(post.id, { status: "posted", expectedUpdatedAt: revisionB });
  });

  it("retains a conflicting draft through reload until the author explicitly adopts the latest copy", async () => {
    vi.mocked(props.onUpdate).mockRejectedValueOnce(Object.assign(new Error("This post changed in another tab."), { code: "POST_CHANGED" }));
    field(render(), "post-caption").props.onChange!({ target: { value: "My local edits" } });
    await button(render(), "Approve final copy").props.onClick!();
    let tree = render();
    expect(field(tree, "post-caption").props.value).toBe("My local edits");
    expect(button(tree, "Save edits").props.disabled).toBe(true);
    expect(button(tree, "Mark as posted").props.disabled).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
    await button(tree, "Load latest for comparison").props.onClick!();
    tree = render();
    expect(field(tree, "post-caption").props.value).toBe("My local edits");
    expect(button(tree, "Caption B")).toBeDefined();
    expect(props.onUpdate).toHaveBeenCalledTimes(1);
    button(tree, "Use latest saved copy").props.onClick!();
    tree = render();
    expect(field(tree, "post-caption").props.value).toBe("Caption B");
    expect(field(tree, "post-hashtags").props.value).toBe("#B");
    await button(tree, "Save edits").props.onClick!();
    expect(props.onUpdate).toHaveBeenLastCalledWith(post.id, { caption: "Caption B", hashtags: "#B", expectedUpdatedAt: revisionB });
  });

  it("retains the old revision and local draft when loading the latest copy fails", async () => {
    vi.mocked(props.onUpdate).mockRejectedValue(Object.assign(new Error("This post changed."), { code: "POST_CHANGED" }));
    vi.mocked(props.onReload).mockRejectedValue(new Error("Could not load the latest saved copy."));
    await button(render(), "Mark as posted").props.onClick!();
    await button(render(), "Load latest for comparison").props.onClick!();
    const tree = render();
    expect(field(tree, "post-caption").props.value).toBe("Caption A");
    expect(button(tree, "Use latest saved copy")).toBeUndefined();
    expect(button(tree, "Mark as posted").props.disabled).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("offers version-bound completion only for an interrupted local simulation", async () => {
    props.post = { ...post, metadata: { delivery: { state: "processing", simulated: true } } };
    props.onDelivery = vi.fn().mockResolvedValue({ ...props.post, updatedAt: revisionB });
    await button(render(), "Complete interrupted simulation").props.onClick!();
    expect(props.onDelivery).toHaveBeenCalledWith(post.id, { action: "recover", expectedUpdatedAt: revisionA });
    props.post = { ...post, metadata: { delivery: { state: "processing", simulated: true, dispatched: true } } };
    expect(button(render(), "Complete interrupted simulation")).toBeUndefined();
  });

});

describe("journal fixture presentation", () => {
  it("preserves the default manual production actions and legacy billing copy", () => {
    props.onDelivery = vi.fn();
    const tree = render();
    expect(button(tree, "Mark as posted")).toBeDefined();
    expect(button(tree, "Skip this one")).toBeDefined();
    expect(find(tree, node => typeof node.props.children === "string" && node.props.children.includes("API simulation requires Pro access"))).toBeDefined();
  });
  it("uses explicit fixture copy and removes manual terminal actions", () => {
    props = { ...props, onDelivery: vi.fn(), allowManualSharing: false, deliveryDescription: "Local server test only." };
    const tree = render();
    expect(button(tree, "Local server test only.")).toBeDefined();
    expect(button(tree, "Mark as posted")).toBeUndefined();
    expect(button(tree, "Skip this one")).toBeUndefined();
    expect(find(tree, node => typeof node.props.children === "string" && node.props.children.includes("Pro access"))).toBeUndefined();
  });
  it("locks a terminal journal receipt without changing legacy simulation behavior", () => {
    props = { ...props, onDelivery: vi.fn(), deliveryReadOnly: true, post: { ...post, metadata: { delivery: { state: "simulated", simulated: true } } } };
    expect(field(render(), "post-caption").props.disabled).toBe(true);
    expect(button(render(), "Schedule local simulation")).toBeUndefined();
    props.deliveryReadOnly = false;
    expect(field(render(), "post-caption").props.disabled).toBe(false);
    expect(button(render(), "Schedule local simulation")).toBeDefined();
  });
});

it("lets an author check a pending trailer without starting another render", async () => {
  props.post = { ...post, contentType: "trailer", status: "asset_pending", mediaAssetId: "saved-asset" };
  const check = button(render(), "Check trailer status");
  expect(check).toBeDefined();
  expect(check.props.disabled).toBe(false);
  await check.props.onClick!();
  expect(props.onGenerateTrailer).toHaveBeenCalledWith(post.id);
});

it("shows a recovery error even while a trailer is pending with an older preview", () => {
  props.post = { ...post, contentType: "trailer", status: "asset_pending", mediaAssetUrl: "https://example.com/old.mp4", assetError: "Contact support before generating again." };
  expect(button(render(), "Contact support before generating again.")).toBeDefined();
});
