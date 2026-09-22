import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real panel and memory hook without adding a DOM dependency.
// Callback identities and effect dependencies must survive renders: otherwise a
// test-only hydration on every render can hide the actual request ordering.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, dirty: false,
  effects: [] as { deps?: React.DependencyList; cleanup?: () => void }[], effectCursor: 0,
  pending: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (value: unknown) => {
      const next = typeof value === "function" ? value(hooks.values[index]) : value;
      if (!Object.is(next, hooks.values[index])) hooks.dirty = true;
      hooks.values[index] = next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown, deps: React.DependencyList) => {
    const index = hooks.cursor++;
    const previous = hooks.values[index] as { callback: unknown; deps: React.DependencyList } | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) hooks.values[index] = { callback, deps };
    return (hooks.values[index] as { callback: unknown }).callback;
  },
  useId: () => "assistant-message",
  useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
    const index = hooks.effectCursor++;
    const previous = hooks.effects[index];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) {
      hooks.pending.push(() => { previous?.cleanup?.(); hooks.effects[index] = { deps, cleanup: effect() || undefined }; });
    }
  },
}));

import AiAssistantPanel, { type AiAssistantPanelProps } from "./AiAssistantPanel";
import AgentProposalCard from "@/features/ai-team/actions/AgentProposalCard";
import AgentPlanCard from "@/features/ai-team/actions/AgentPlanCard";
import MemoryControls from "@/features/ai-team/memory/MemoryControls";
import type { ConversationMemory } from "@/features/ai-team/memory/useConversationMemory";

type Element = React.ReactElement<Record<string, unknown>>;
const props: AiAssistantPanelProps = { bookId: "book", chapterId: null, activeTool: "edit" };
const emptyConversations = () => ({ threads: [], thread: null, messages: [] });
// Edith and Stella answer through /agent/run, the rest through /ai/chat. One
// fixture carries both shapes so these regressions cover whichever the panel
// picks, rather than quietly passing because the URL no longer matches.
const savedReply = (overrides: Record<string, unknown> = {}) => ({
  id: "assistant-reply", role: "assistant", content: "A saved suggestion", summary: "A saved suggestion",
  source: "llm", actions: [], planId: null, plan: null, stats: null,
  context: { chapterId: null, chapterText: null }, bookId: "book", chapterId: null,
  threadId: "saved-thread", persistence: "saved", ...overrides,
});
const isReplyRequest = (url: string) => url.endsWith("/chat") || url.endsWith("/agent/run");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function elements(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(elements)];
}
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray((node as Element).props.children as React.ReactNode).map(text).join("");
}
function render(overrides: Partial<AiAssistantPanelProps> = {}) {
  let tree: React.ReactNode;
  for (let pass = 0; pass < 20; pass++) {
    hooks.cursor = 0; hooks.effectCursor = 0; hooks.dirty = false;
    tree = AiAssistantPanel({ ...props, ...overrides });
    hooks.pending.splice(0).forEach((effect) => effect());
    if (!hooks.dirty) return tree;
  }
  throw new Error("Assistant test did not settle after effects.");
}
function input(tree: React.ReactNode) { return elements(tree).find((element) => element.type === "textarea")!; }
function changeDraft(value: string) {
  (input(render()).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function shortcut(tree = render()) {
  (input(tree).props.onKeyDown as (event: unknown) => void)({ key: "Enter", metaKey: true, ctrlKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn() });
}
function memory(tree: React.ReactNode): ConversationMemory {
  return elements(tree).find((element) => element.type === MemoryControls)!.props.memory as ConversationMemory;
}
function turns(tree: React.ReactNode) {
  return elements(tree).filter((element) => element.props["data-role"] === "user" || element.props["data-role"] === "assistant").map(text);
}
function mockApi(chat: () => Promise<Response> = async () => Response.json(savedReply())) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (isReplyRequest(url)) return chat();
    if (url.includes("/memory")) return Response.json({ enabled: true, memories: [] });
    if (url.includes("/conversations")) return Response.json(emptyConversations());
    throw new Error(`Unexpected assistant request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function open() {
  render();
  await vi.waitFor(() => expect(memory(render()).ready).toBe(true));
}
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.dirty = false; hooks.effects = []; hooks.effectCursor = 0; hooks.pending = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  hooks.effects.forEach((effect) => effect.cleanup?.());
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const planReply = () => savedReply({
  planId: "plan-1",
  plan: { versionId: "edition", steps: [{ id: "s1", tool: "replace_in_book", reason: "Rename.", replacement: "Jonas", matches: [
    { matchId: "m1", chapterId: "c1", chapterTitle: "Hamnen", chapterHash: "h", from: 1, to: 6, text: "Johan", before: "", after: " gick.", replacement: "Jonas", preselected: true },
  ] }] },
  stats: { steps: 1, replacements: 1, optional: 0, chapters: [{ chapterId: "c1", chapterTitle: "Hamnen", count: 1 }] },
});

describe("whole-book plans", () => {
  it("shows the plan for approval and writes nothing until it is approved", async () => {
    const fetch = mockApi(async () => Response.json(planReply()));
    await open(); changeDraft("Byt Johan mot Jonas i hela boken"); shortcut();
    await vi.waitFor(() => expect(turns(render())).toHaveLength(2));

    expect(elements(render()).some((element) => element.type === AgentPlanCard)).toBe(true);
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/agent/apply"))).toBe(false);
  });

  it("posts the plan id and the author's selection, never the steps themselves", async () => {
    const fetch = mockApi(async () => Response.json(planReply()));
    await open(); changeDraft("Byt Johan mot Jonas i hela boken"); shortcut();
    await vi.waitFor(() => expect(turns(render())).toHaveLength(2));

    fetch.mockImplementation(async (url: string) => url.endsWith("/agent/apply")
      ? Response.json({ planId: "plan-1", changed: 1, outcomes: [{ stepId: "s1", status: "applied", detail: "1 passage changed.", changed: 1 }] })
      : Response.json({ enabled: true, memories: [] }));
    const card = elements(render()).find((element) => element.type === AgentPlanCard)!;
    (card.props.onApply as (selection: { stepIds: string[]; matchIds: string[] }) => void)({ stepIds: ["s1"], matchIds: ["m1"] });

    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith("/agent/apply"))).toBe(true));
    const call = fetch.mock.calls.find(([url]) => url.endsWith("/agent/apply"))!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body).toEqual({ planId: "plan-1", stepIds: ["s1"], matchIds: ["m1"] });
    expect(body).not.toHaveProperty("plan");
    // The harness renders the panel only, so the result is read off the card's
    // props rather than its markup.
    await vi.waitFor(() => {
      const applied = elements(render()).find((element) => element.type === AgentPlanCard)!;
      expect(applied.props.state).toMatchObject({ changed: 1 });
    });
  });
});

describe("saved assistant conversation regressions", () => {
  it("keeps a keyboard-submitted draft while saved history is still loading", () => {
    const pending = deferred<Response>();
    const fetch = vi.fn(() => pending.promise); vi.stubGlobal("fetch", fetch);
    changeDraft("Please keep this draft");
    expect(memory(render()).ready).toBe(false);
    shortcut();
    expect(input(render()).props.value).toBe("Please keep this draft");
    expect(fetch.mock.calls).toHaveLength(2);
  });

  it("keeps a keyboard-submitted draft when loading saved history fails", async () => {
    const fetch = vi.fn(async () => Response.json({ error: "AI_MEMORY_UNAVAILABLE" }, { status: 503 }));
    vi.stubGlobal("fetch", fetch); render();
    await vi.waitFor(() => expect(memory(render()).error).toBeTruthy());
    changeDraft("Keep this during the outage"); shortcut();
    expect(input(render()).props.value).toBe("Keep this during the outage");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a keyboard-submitted draft while a preference save is pending", async () => {
    const pending = deferred<Response>();
    const fetch = mockApi(); await open();
    fetch.mockImplementationOnce(() => pending.promise);
    const save = memory(render()).saveMemory("Keep short sentences", "book");
    changeDraft("Send when memory is ready"); shortcut();
    expect(input(render()).props.value).toBe("Send when memory is ready");
    expect(fetch.mock.calls.some(([url]) => isReplyRequest(url))).toBe(false);
    pending.resolve(Response.json({ enabled: true, memories: [] })); await save;
  });

  it("shows a completed retry as saved historical text without provider failure or actions", async () => {
    mockApi(async () => Response.json(savedReply({ source: "history", provider: null,
      actions: [{ kind: "edit_text", original: "Old", replacement: "New", reason: "An old proposal must never execute" }],
    })));
    await open(); changeDraft("Retry my message"); shortcut();
    await vi.waitFor(() => expect(turns(render())).toHaveLength(2));
    const tree = render();
    expect(text(tree)).toContain("Conversation saved");
    expect(text(tree)).toContain("Saved conversation · ask for a fresh suggestion");
    expect(text(tree)).not.toContain("The AI service is unavailable");
    expect(elements(tree).some((element) => element.type === AgentProposalCard)).toBe(false);
  });

  it("keeps the pending turn after switching to another specialist and back", async () => {
    const pending = deferred<Response>();
    mockApi(() => pending.promise); await open();
    changeDraft("Please remember this pending message"); shortcut();
    expect(turns(render())).toHaveLength(1);
    render({ activeTool: "translate" });
    await vi.waitFor(() => expect(memory(render({ activeTool: "translate" })).ready).toBe(true));
    render(); await vi.waitFor(() => expect(memory(render()).ready).toBe(true));
    expect(turns(render())).toEqual(["Please remember this pending message"]);
    pending.resolve(Response.json(savedReply()));
    await vi.waitFor(() => expect(turns(render())).toHaveLength(2));
    expect(turns(render())[0]).toBe("Please remember this pending message");
  });

  it("does not let a history read started earlier erase a completed reply", async () => {
    const chat = deferred<Response>(); const staleHistory = deferred<Response>();
    const fetch = mockApi(() => chat.promise); await open();
    changeDraft("Preserve my new reply"); shortcut();
    render({ activeTool: "translate" });
    await vi.waitFor(() => expect(memory(render({ activeTool: "translate" })).ready).toBe(true));
    fetch.mockImplementation(async (url: string) => url.includes("/conversations")
      ? staleHistory.promise : Response.json({ enabled: true, memories: [] }));
    render(); // Start an old snapshot before the chat response arrives.
    chat.resolve(Response.json(savedReply()));
    await vi.waitFor(() => expect(turns(render())).toHaveLength(2));
    staleHistory.resolve(Response.json(emptyConversations()));
    await vi.waitFor(() => expect(memory(render()).ready).toBe(true));
    expect(turns(render())).toHaveLength(2);
    expect(turns(render())[1]).toContain("A saved suggestion");
    expect(memory(render()).thread?.id).toBe("saved-thread");
  });
});
