"use client";
import { useId, useState } from "react";
import { Brain, ChevronLeft, Download, History, Plus, Trash2 } from "lucide-react";
import type { ConversationMemory } from "./useConversationMemory";
import { MAX_MEMORY_CHARS, type Memory, type MemoryScope } from "./contracts";
import styles from "./MemoryControls.module.css";

const scopeLabel: Record<MemoryScope, string> = { author: "All my books", book: "This book", edition: "This edition" };
export default function MemoryControls({ memory, editionLabel, hasEdition, busy, transcript, onViewChange }: {
  memory: ConversationMemory; editionLabel?: string; hasEdition: boolean; busy: boolean; transcript: Array<{ id: string; role: string; content: string }>; onViewChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<"memory" | "history" | null>(null);
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<MemoryScope>("book");
  const [editing, setEditing] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputId = useId();
  const disabled = busy || memory.pending;
  const show = (next: typeof view) => { setView(next); onViewChange(Boolean(next)); setError(null); setNotice(null); setConfirmDelete(null); };
  const action = async (run: () => Promise<void>, success?: string) => {
    setError(null); setNotice(null);
    try { await run(); if (success) setNotice(success); }
    catch (err) { setError(err instanceof Error ? err.message : "That change could not be saved. Please retry."); }
  };
  const clearForm = () => { setContent(""); setEditing(null); setScope("book"); };
  const exportConversation = () => {
    const blob = new Blob([JSON.stringify({ conversation: memory.thread, messages: transcript.map(({ id, role, content }) => ({ id, role, content })), preferences: memory.memories }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "verkli-conversation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className={styles.root} data-expanded={Boolean(view)}>
    <div className={styles.toolbar}>
      <button type="button" disabled={disabled || memory.temporary || !memory.ready} aria-expanded={view === "memory"} onClick={() => show(view === "memory" ? null : "memory")}><Brain size={15} aria-hidden />Team memory</button>
      <button type="button" disabled={disabled || memory.temporary || !memory.ready} aria-expanded={view === "history"} onClick={() => show(view === "history" ? null : "history")}><History size={15} aria-hidden />History</button>
      <button type="button" disabled={disabled || !memory.ready} onClick={() => void action(async () => { await memory.newConversation(); show(null); })} aria-label="New conversation"><Plus size={17} aria-hidden /></button>
    </div>
    <label className={styles.temporary}><input type="checkbox" checked={memory.temporary} disabled={disabled} onChange={() => { show(null); memory.toggleTemporary(); }} />Temporary conversation<span>{memory.temporary ? "Not saved · memory off" : memory.error ? "Storage unavailable" : memory.loading ? "Loading history…" : memory.enabled ? "History on · memory on" : "History on · memory off"}</span></label>
    {memory.loading && <p className={styles.status} role="status">Opening your saved conversation…</p>}
    {memory.error && <div className={styles.error} role="alert"><p>{memory.error}</p><button type="button" onClick={memory.retry}>Retry loading</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.status} role="status">{notice}</p>}
    {view && <div className={styles.details}>
      <div className={styles.heading}><button type="button" onClick={() => show(null)} aria-label="Back to conversation"><ChevronLeft size={19} aria-hidden /></button><h3>{view === "memory" ? "What your team remembers" : "Your conversations"}</h3></div>
      {view === "memory" ? <>
        <p className={styles.intro}>Tell your specialists what matters. Saved preferences are shared with your team within the scope you choose. They never change your manuscript automatically.</p>
        <label className={styles.switch}><input type="checkbox" checked={memory.enabled} disabled={disabled} onChange={(event) => void action(() => memory.setEnabled(event.target.checked), "Memory preference saved.")} />Use my saved preferences</label>
        {!memory.enabled && <p className={styles.status}>Your preferences are kept, but specialists will not use them until you turn memory on.</p>}
        {memory.memories.length === 0 && <p className={styles.empty}>No preferences yet. Start with your writing voice, your audience or a name you want the team to remember.</p>}
        <ul className={styles.list}>{memory.memories.map((item) => <li key={item.id}>
          <span className={styles.scope}>{scopeLabel[item.scope]}{item.scope === "edition" && editionLabel ? ` · ${editionLabel}` : ""}</span><p>{item.content}</p>
          <small>Saved by you · {new Date(item.updatedAt).toLocaleDateString()}</small>
          <div className={styles.actions}><button type="button" disabled={disabled} onClick={() => { setEditing(item); setContent(item.content); setScope(item.scope); setNotice(null); }}>Edit preference</button><button type="button" disabled={disabled} onClick={() => setConfirmDelete(item.id)}>Forget</button></div>
          {confirmDelete === item.id && <div className={styles.confirm}><p>Forget this preference? Past conversation text stays in history, but this preference will no longer be added as team memory. Start a new conversation to leave that old context behind.</p><button type="button" disabled={disabled} onClick={() => void action(async () => { await memory.deleteMemory(item.id); setConfirmDelete(null); if (editing?.id === item.id) clearForm(); }, "Preference forgotten.")}>Confirm forget</button><button type="button" onClick={() => setConfirmDelete(null)}>Keep it</button></div>}
        </li>)}</ul>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void action(async () => { await memory.saveMemory(content, scope, editing?.id); clearForm(); }, `Saved for ${scopeLabel[scope].toLowerCase()}.`); }}>
          <label htmlFor={inputId}>{editing ? "Edit your preference" : "Remember for next time"}</label>
          <textarea id={inputId} value={content} onChange={(event) => setContent(event.target.value)} maxLength={MAX_MEMORY_CHARS} rows={3} placeholder="Keep my short sentences and understated humour." required />
          <label htmlFor={`${inputId}-scope`}>Use this for</label>
          <select id={`${inputId}-scope`} value={scope} disabled={Boolean(editing) || disabled} onChange={(event) => setScope(event.target.value as MemoryScope)}>
            <option value="book">This book</option>{hasEdition && <option value="edition">This edition{editionLabel ? ` · ${editionLabel}` : ""}</option>}<option value="author">All my books</option>
          </select>
          <div className={styles.actions}><button className={styles.primary} type="submit" disabled={disabled || !content.trim()}>{memory.pending ? "Saving…" : editing ? "Save preference" : "Remember this"}</button>{editing && <button type="button" onClick={clearForm}>Cancel edit</button>}<small>{content.length}/{MAX_MEMORY_CHARS}</small></div>
        </form>
      </> : <>
        <p className={styles.intro}>Conversations with this specialist in the current book and edition. Earlier suggestions are read-only; ask for a fresh suggestion to make another change.</p>
        {memory.threads.length === 0 ? <p className={styles.empty}>Your first saved conversation will appear here after you send a message.</p> : <ul className={styles.list}>{memory.threads.map((thread) => <li key={thread.id}>
          <button type="button" className={styles.thread} aria-current={memory.thread?.id === thread.id ? "true" : undefined} disabled={disabled} onClick={() => { memory.selectConversation(thread.id); show(null); }}><span>{thread.title || "New conversation"}</span><small>{new Date(thread.updatedAt).toLocaleDateString()}</small></button>
        </li>)}</ul>}
        {memory.thread && <div className={styles.actions}>
          <button type="button" disabled={disabled} onClick={exportConversation}><Download size={15} aria-hidden />Export loaded history</button>
          <button type="button" disabled={disabled} onClick={() => setConfirmDelete("conversation")}><Trash2 size={15} aria-hidden />Delete conversation</button>
        </div>}
        <p className={styles.intro}>The latest 20 conversations and 50 messages per conversation are shown. Deleting a conversation keeps your separately saved preferences.</p>
        {confirmDelete === "conversation" && <div className={styles.confirm}><p>Delete this conversation and its messages? This cannot be undone.</p><button type="button" disabled={disabled} onClick={() => void action(async () => { await memory.deleteConversation(); show(null); })}>Confirm delete conversation</button><button type="button" onClick={() => setConfirmDelete(null)}>Keep conversation</button></div>}
      </>}
    </div>}
  </div>;
}
