"use client";
import { useEffect, useState } from "react";
import AiAssistantPanel from "@/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel";
import type { Tool } from "@/app/(app-author)/author/books/[id]/editor/bookEditor.shared";
import type { Memory, SavedMessage, SavedThread } from "@/features/ai-team/memory/contracts";

const BOOK = "00000000-0000-4000-8000-000000000001";
const EDITIONS = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"];
const CHAPTER = "00000000-0000-4000-8000-000000000002";
const STORAGE = "verkli-ai-memory-development-fixture-v1";
type Fixture = { enabled: boolean; memories: Array<Memory & { editionId: string | null }>; threads: Array<SavedThread & { tool: string; editionId: string | null; messages: SavedMessage[] }> };
export default function Preview() {
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("edit");
  const [edition, setEdition] = useState(0);
  const [instance, setInstance] = useState(0);
  const [failure, setFailure] = useState(false);
  const [delay, setDelay] = useState(false);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (!url.pathname.startsWith("/api/") && url.origin === location.origin) return original(input, init);
      // Development-only synthetic fixture. Never forward requests to a real API/provider.
      if (url.origin !== location.origin || !url.pathname.startsWith(`/api/books/${BOOK}/ai/`)) return Response.json({ error: "PREVIEW_ONLY" }, { status: 403 });
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (!body.conversation?.temporary && sessionStorage.getItem(`${STORAGE}-failure`) === "true") return Response.json({ error: "SIMULATED_STORAGE_FAILURE" }, { status: 503 });
      let data: Fixture;
      try { data = JSON.parse(sessionStorage.getItem(STORAGE) || "null") ?? { enabled: true, memories: [], threads: [] }; }
      catch { return Response.json({ error: "INVALID_FIXTURE_DATA" }, { status: 500 }); }
      const editionId = body.editionId ?? url.searchParams.get("editionId");
      const persist = () => sessionStorage.setItem(STORAGE, JSON.stringify(data));
      const snapshot = () => ({ enabled: data.enabled, memories: data.memories.filter((item) => item.scope !== "edition" || item.editionId === editionId) });
      const now = () => new Date().toISOString();
      if (url.pathname.endsWith("/memory")) {
        if (body.operation === "save") {
          const item = { id: body.id ?? crypto.randomUUID(), content: body.content, scope: body.scope, editionId: body.editionId, updatedAt: now() };
          data.memories = [item, ...data.memories.filter((old) => old.id !== item.id)]; persist();
        } else if (body.operation === "delete") { data.memories = data.memories.filter((item) => item.id !== body.id); persist(); }
        else if (body.operation === "settings") { data.enabled = body.enabled; persist(); }
        return Response.json(snapshot());
      }
      if (url.pathname.endsWith("/conversations")) {
        if (body.operation === "create") {
          const thread = { id: crypto.randomUUID(), title: "New conversation", tool: body.tool, editionId, updatedAt: now(), messages: [] };
          data.threads.unshift(thread); persist(); return Response.json({ thread });
        }
        if (body.operation === "delete") { data.threads = data.threads.filter((item) => item.id !== body.threadId); persist(); return Response.json({ deleted: true }); }
        const threads = data.threads.filter((item) => item.tool === url.searchParams.get("tool") && item.editionId === editionId);
        const thread = url.searchParams.get("threadId") ? threads.find((item) => item.id === url.searchParams.get("threadId")) ?? null : threads[0] ?? null;
        return Response.json({ threads, thread, messages: thread?.messages.slice(-50) ?? [] });
      }
      if (url.pathname.endsWith("/chat")) {
        if (sessionStorage.getItem(`${STORAGE}-delay`) === "true") await new Promise((resolve) => setTimeout(resolve, 8000));
        const context = body.conversation;
        const memories = context.temporary || !data.enabled ? [] : data.memories.filter((item) => item.scope !== "edition" || item.editionId === context.editionId);
        const content = memories.length ? `I’m keeping your preferences in mind: ${memories.map((item) => item.content).join(" · ")}\n\nLet’s work on your current passage.` : "Let’s work on this passage. No saved preferences were used for this reply.";
        const id = crypto.randomUUID();
        let threadId: string | undefined;
        if (!context.temporary) {
          let thread = data.threads.find((item) => item.id === context.threadId);
          if (!thread) { thread = { id: crypto.randomUUID(), tool: body.tool, editionId: context.editionId ?? null, title: body.message.slice(0, 80), updatedAt: now(), messages: [] }; data.threads.unshift(thread); }
          threadId = thread.id; thread.updatedAt = now();
          thread.messages.push({ id: context.requestId, role: "user", content: body.message, createdAt: now() }, { id, role: "assistant", content, createdAt: now() }); persist();
        }
        return Response.json({ id, threadId, content, source: "llm", actions: [], persistence: context.temporary ? "temporary" : "saved", context: { chapterId: body.chapterId, chapterText: "Mira arrived at the harbour." } });
      }
      return Response.json({ error: "PREVIEW_ONLY" }, { status: 403 });
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = original; };
  }, []);
  return <main className="mx-auto max-w-5xl px-4 py-6">
    <h1 className="font-display text-2xl">A team that remembers your work</h1>
    <p className="mt-3 text-sm text-muted-foreground">Development preview · synthetic conversations in this tab’s session storage. No real AI calls or database writes.</p>
    <div className="my-5 flex flex-wrap items-center gap-3">
      <label>Specialist <select aria-label="Specialist" className="input-base" value={tool} onChange={(event) => setTool(event.target.value as Tool)}><option value="edit">Edith</option><option value="translate">Alma</option><option value="audiobook">August</option><option value="cover">Stella</option><option value="pricing">Ernst</option></select></label>
      <label>Edition <select aria-label="Edition" className="input-base" value={edition} onChange={(event) => setEdition(Number(event.target.value))}><option value={0}>English original</option><option value={1}>Swedish translation</option></select></label>
      <button className="btn-secondary" type="button" onClick={() => setInstance((value) => value + 1)}>Reopen assistant</button>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={failure} onChange={(event) => { setFailure(event.target.checked); sessionStorage.setItem(`${STORAGE}-failure`, String(event.target.checked)); }} />Simulate storage failure</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={delay} onChange={(event) => { setDelay(event.target.checked); sessionStorage.setItem(`${STORAGE}-delay`, String(event.target.checked)); }} />Delay replies for navigation testing</label>
    </div>
    {ready && <AiAssistantPanel key={`${edition}:${instance}`} bookId={BOOK} editionId={EDITIONS[edition]} editionLabel={edition === 0 ? "English original" : "Swedish translation"} bookTitle="The harbour" chapterId={CHAPTER} chapterTitle="The arrival" activeTool={tool} getDraftText={() => "Mira arrived at the harbour."} />}
  </main>;
}
