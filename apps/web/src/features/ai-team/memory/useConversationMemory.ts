"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantTool } from "@/lib/ai/agent-actions";
import type { ConversationSnapshot, MemoryScope, MemorySnapshot, SavedThread } from "./contracts";
import { restoreTranscript } from "./transcript";

const EMPTY: MemorySnapshot & ConversationSnapshot = { enabled: true, memories: [], threads: [], thread: null, messages: [] };
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to access your saved conversations."
    : response.status === 409 ? "This conversation changed in another session. Reload it before continuing."
    : response.status === 404 ? "This saved item is no longer available. Reload your conversations."
    : response.status === 400 ? "Check the preference and its scope, then try again."
    : "Your saved conversations and preferences could not be reached. Retry, or explicitly choose a temporary conversation.");
  return response.json() as Promise<T>;
}

export function useConversationMemory(bookId: string, editionId: string | null, tool: AssistantTool, initialTemporary = false) {
  const [temporary, setTemporary] = useState(initialTemporary);
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const scope = `${bookId}:${editionId ?? "book"}:${tool}:${temporary ? "temporary" : "saved"}`;
  const selectedId = selection?.scope === scope ? selection.id : null;
  const contextKey = `${scope}:${selectedId ?? "latest"}:${revision}`;
  const [state, setState] = useState<{ key: string; data: typeof EMPTY; error: string | null; loadStartedAt: number }>({ key: "", data: EMPTY, error: null, loadStartedAt: 0 });
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const activeKey = useRef(contextKey);
  const replies = useRef(new Map<string, { thread: SavedThread; receivedAt: number }>());
  const mounted = useRef(false);
  useEffect(() => { activeKey.current = contextKey; }, [contextKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const endpoint = `/api/books/${bookId}/ai`;
  const params = new URLSearchParams({ tool, ...(editionId ? { editionId } : {}), ...(selectedId ? { threadId: selectedId } : {}) });
  const query = params.toString();
  useEffect(() => {
    if (temporary) return;
    const controller = new AbortController();
    const loadStartedAt = performance.now();
    void Promise.all([
      request<MemorySnapshot>(`${endpoint}/memory?${editionId ? new URLSearchParams({ editionId }) : ""}`, { signal: controller.signal }),
      request<ConversationSnapshot>(`${endpoint}/conversations?${query}`, { signal: controller.signal }),
    ]).then(([memory, conversations]) => {
      restoreTranscript(conversations.messages); // Validate before enabling the composer.
      const reply = replies.current.get(contextKey);
      // A chat can finish while this older history request is loading. Retain
      // its server thread identity so the next message continues that conversation.
      const latest = reply && reply.receivedAt >= loadStartedAt ? { ...conversations, thread: reply.thread,
        threads: [reply.thread, ...conversations.threads.filter((item) => item.id !== reply.thread.id)].slice(0, 20) } : conversations;
      if (!controller.signal.aborted) setState({ key: contextKey, data: { ...memory, ...latest }, error: null, loadStartedAt });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key: contextKey, data: EMPTY, loadStartedAt, error: error instanceof Error ? error.message : "Could not load your conversations." });
    });
    return () => controller.abort();
  }, [contextKey, editionId, endpoint, query, temporary]);
  const current = state.key === contextKey ? state : { key: contextKey, data: EMPTY, error: null, loadStartedAt: 0 };
  const ready = temporary || (state.key === contextKey && !state.error);
  const run = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    const key = contextKey;
    setPendingKey(key);
    try {
      const data = await request<T>(`${endpoint}/${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!mounted.current || activeKey.current !== key) throw new Error("The workspace changed. Reopen it to see the saved result.");
      return data;
    } finally { if (mounted.current) setPendingKey((value) => value === key ? null : value); }
  }, [contextKey, endpoint]);
  const saveMemory = async (content: string, memoryScope: MemoryScope, id?: string) => {
    const data = await run<MemorySnapshot>("memory", { operation: "save", content, scope: memoryScope, ...(id ? { id } : {}), editionId });
    setState((previous) => previous.key === contextKey ? { ...previous, data: { ...previous.data, ...data } } : previous);
  };
  const deleteMemory = async (id: string) => {
    const data = await run<MemorySnapshot>("memory", { operation: "delete", id, editionId });
    setState((previous) => previous.key === contextKey ? { ...previous, data: { ...previous.data, ...data } } : previous);
  };
  const setEnabled = async (enabled: boolean) => {
    const data = await run<MemorySnapshot>("memory", { operation: "settings", enabled, editionId });
    setState((previous) => previous.key === contextKey ? { ...previous, data: { ...previous.data, ...data } } : previous);
  };
  const newConversation = async () => {
    if (temporary) { setRevision((value) => value + 1); return; }
    const data = await run<{ thread: SavedThread }>("conversations", { operation: "create", tool, editionId });
    setSelection({ scope, id: data.thread.id });
  };
  const deleteConversation = async () => {
    const id = current.data.thread?.id;
    if (!id || temporary) return;
    await run("conversations", { operation: "delete", threadId: id });
    setSelection(null); setRevision((value) => value + 1);
  };
  const rememberReply = (threadId: string, title: string) => {
    const known = current.data.threads.find((item) => item.id === threadId);
    const thread = { id: threadId, title: known?.title ?? title.slice(0, 80), updatedAt: new Date().toISOString() };
    replies.current.set(contextKey, { thread, receivedAt: performance.now() });
    setState((previous) => {
      if (previous.key !== contextKey) return previous;
      return { ...previous, data: { ...previous.data, thread, threads: [thread, ...previous.data.threads.filter((item) => item.id !== threadId)].slice(0, 20) } };
    });
  };
  return { ...current.data, loadStartedAt: current.loadStartedAt, contextKey, temporary, ready, loading: !temporary && state.key !== contextKey, error: current.error,
    pending: pendingKey === contextKey, saveMemory, deleteMemory, setEnabled, newConversation, deleteConversation, rememberReply,
    selectConversation: (id: string) => setSelection({ scope, id }),
    retry: () => setRevision((value) => value + 1),
    toggleTemporary: () => { setTemporary((value) => !value); setRevision((value) => value + 1); },
  };
}
export type ConversationMemory = ReturnType<typeof useConversationMemory>;
