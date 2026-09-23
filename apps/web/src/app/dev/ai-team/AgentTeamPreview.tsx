"use client";

import { useState } from "react";
import AgentTeam from "@/features/ai-team/AgentTeam";
import AgentCompanion from "@/features/ai-team/AgentCompanion";
import { agents } from "@/features/ai-team/agents";
import AiAssistantPanel from "@/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel";

/** Synthetic presentation fixture. Browser QA intercepts chat; no credentials. */
export default function AgentTeamPreview() {
  const [workspace, setWorkspace] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [created, setCreated] = useState(false);
  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-10">
      <div className="flex flex-wrap gap-4 rounded-xl border border-border p-4 text-sm">
        <span>Local team fixture · Synthetic book</span>
        <label><input type="checkbox" checked={workspace} onChange={(event) => setWorkspace(event.target.checked)} /> Workspace</label>
        <label><input type="checkbox" checked={empty} onChange={(event) => setEmpty(event.target.checked)} /> No book</label>
        <button type="button" onClick={() => document.documentElement.classList.toggle("dark")}>Toggle theme</button>
      </div>
      <AgentTeam workspace={workspace} bookId={empty ? null : "avatar-preview"} bookTitle="The first page" onCreateBook={() => setCreated(true)} />
      {created && <p role="status">Create book action received.</p>}
      <div className="my-12 space-y-6">{agents.map((agent) => <AgentCompanion key={agent.id} agent={agent.id} />)}</div>
      <section className="mx-auto flex h-[740px] max-h-[85svh] max-w-[440px] flex-col" aria-label="Edith chat preview">
        <AiAssistantPanel initialTemporary bookId="avatar-preview" chapterId={null} variant="dock" />
      </section>
    </main>
  );
}
