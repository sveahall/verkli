"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CornerDownLeft, Send, X } from "lucide-react";
import { z } from "zod";
import AgentAvatar from "@/features/ai-team/AgentAvatar";
import { getAgent } from "@/features/ai-team/agents";
import { agentConversations, conversationTool } from "@/features/ai-team/agent-conversations";
import { buildConversationHistory } from "@/features/ai-team/actions/conversation-history";
import AgentProposalCard, { type ProposalState } from "@/features/ai-team/actions/AgentProposalCard";
import AgentPlanCard, { type PlanOutcome, type PlanState, type PlanStats } from "@/features/ai-team/actions/AgentPlanCard";
import type { Plan } from "@/lib/ai/agent-runtime/plan";
import type { ExecuteAgentAction, ProposalContext } from "@/features/ai-team/actions/editor-action";
import { agentReplySchema, type AgentAction } from "@/lib/ai/agent-actions";
import styles from "@/features/ai-team/AgentConversation.module.css";
import type { Tool } from "../bookEditor.shared";
import MemoryControls from "@/features/ai-team/memory/MemoryControls";
import { useConversationMemory } from "@/features/ai-team/memory/useConversationMemory";
import { restoreTranscript } from "@/features/ai-team/memory/transcript";
import type { InlineAiAction } from "@/features/book-workspace/types";

export type PendingAiRequest = { id: string; action: InlineAiAction; selectedText: string };
export type AiAssistantPanelProps = {
  bookId: string; bookTitle?: string; editionId?: string | null; editionLabel?: string; initialTemporary?: boolean; chapterId: string | null; chapterTitle?: string | null;
  pendingRequest?: PendingAiRequest | null; onPendingRequestHandled?: () => void;
  variant?: "page" | "dock"; onClose?: () => void; activeTool?: Tool;
  getDraftText?: () => string | undefined;
  onExecuteAction?: ExecuteAgentAction;
  /** The agent writes chapters on the server; the workspace reloads them. */
  onBookChanged?: () => void;
};
type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string;
  historical?: boolean; persistence?: "saved" | "temporary" | "failed"; source?: "llm" | "template" | "history"; failureReason?: "invalid_proposal" | "unavailable"; failed?: boolean; actions?: AgentAction[]; context?: ProposalContext;
};
type Retry = { id: string; message: string; selectedText: string | null; chapterId: string | null };
type Thread = { lastMessageChange: number; messages: ChatMessage[]; draft: string; sending: boolean; error: string | null; retry?: Retry };
const emptyThread = (): Thread => ({ lastMessageChange: 0, messages: [], draft: "", sending: false, error: null });
const contextSchema = z.object({ chapterId: z.string().nullable(), chapterText: z.string().nullable() });
/**
 * The two specialists that plan and act across the whole book. The others still
 * answer through the advice route, which is scoped to the open chapter — so a
 * tool only becomes agentic once it has tools worth having.
 */
const AGENTIC_TOOLS = new Set(["edit", "cover"]);
type PlanEntry = { planId: string; plan: Plan; stats: PlanStats; stoppedBecause?: string; state: PlanState };
function storedApplyResult(json: unknown): { outcomes: PlanOutcome[]; changed: number } | null {
  if (!json || typeof json !== "object" || !("outcomes" in json) || !Array.isArray(json.outcomes)) return null;
  const outcomes: PlanOutcome[] = [];
  for (const row of json.outcomes) {
    if (!row || typeof row !== "object") return null;
    const item = row as { stepId?: unknown; status?: unknown; detail?: unknown; changed?: unknown };
    if (typeof item.stepId !== "string" || typeof item.status !== "string" || typeof item.detail !== "string") return null;
    outcomes.push({
      stepId: item.stepId,
      status: item.status,
      detail: item.detail,
      ...(typeof item.changed === "number" ? { changed: item.changed } : {}),
    });
  }
  const changed = "changed" in json && typeof json.changed === "number"
    ? json.changed
    : outcomes.reduce((total, outcome) => total + (outcome.changed ?? 0), 0);
  return { outcomes, changed };
}

/** The apply body is parsed as `unknown` on purpose, so every read is narrowed. */
function applyMessage(json: unknown): string | null {
  return json && typeof json === "object" && "message" in json && typeof json.message === "string" ? json.message : null;
}

function wroteSomething(outcomes: { status: string }[] | null | undefined, changed: number): boolean {
  return changed > 0 || Boolean(outcomes?.some((outcome) => outcome.status === "applied"));
}

/** A 409 can win the claim race before the writer has stored its outcome. */
export const APPLIED_PLAN_RETRIES = 4;
export const APPLIED_PLAN_RETRY_MS = 700;

const ACTION_PROMPTS: Partial<Record<InlineAiAction, string>> = {
  rewrite: "Suggest a rewrite of this passage. Keep the meaning and my voice.",
  pacing: "Suggest a precise edit to improve the pacing of this passage.",
  expand: "Suggest an expanded version of this passage with more detail.",
};

export default function AiAssistantPanel({ bookId, bookTitle, editionId = null, editionLabel, initialTemporary = false, chapterId, chapterTitle, variant = "page", onClose,
  activeTool = "edit", pendingRequest, onPendingRequestHandled, getDraftText, onExecuteAction, onBookChanged,
}: AiAssistantPanelProps) {
  const tool = conversationTool(activeTool);
  const agentic = AGENTIC_TOOLS.has(tool);
  const persona = agentConversations[tool];
  const agent = getAgent(persona.agent);
  const memory = useConversationMemory(bookId, editionId, tool, initialTemporary);
  const threadKey = memory.contextKey;
  const [memoryView, setMemoryView] = useState({ key: "", open: false });
  const memoryOpen = memoryView.key === threadKey && memoryView.open;
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const threadsRef = useRef(threads);
  const thread = threads[threadKey] ?? emptyThread();
  const [results, setResults] = useState<Record<string, ProposalState>>({});
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const busyActions = useRef(new Set<string>());
  const inFlight = useRef(new Map<string, AbortController>());
  // React state lags a click. This set is the lock that stops a second Run
  // from posting the same plan while the first request is still writing it.
  const settledPlans = useRef(new Set<string>());
  const audioUrls = useRef(new Set<string>());
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const mounted = useRef(true);
  const updateThread = useCallback((key: string, update: (previous: Thread) => Thread) => {
    if (!mounted.current) return;
    const next = { ...threadsRef.current, [key]: update(threadsRef.current[key] ?? emptyThread()) };
    threadsRef.current = next;
    setThreads(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const requests = inFlight.current;
    const urls = audioUrls.current;
    return () => { mounted.current = false; requests.forEach((controller) => controller.abort()); requests.clear(); urls.forEach(URL.revokeObjectURL); urls.clear(); };
  }, []);

  useEffect(() => {
    if (!memory.ready || memory.temporary) return;
    // A history request may finish after a local turn; never erase that newer work.
    updateThread(threadKey, (previous) => previous.sending || previous.lastMessageChange >= memory.loadStartedAt
      ? previous : { ...previous, messages: restoreTranscript(memory.messages) });
  }, [memory.ready, memory.temporary, memory.messages, memory.loadStartedAt, threadKey, updateThread]);

  const send = useCallback(async (message: string, selectedText: string | null = null, retryId?: string) => {
    const value = message.trim();
    if (!value || !memory.ready || memory.pending || inFlight.current.has(threadKey)) return;
    const selection = selectedText?.slice(0, 2000) || null;
    const controller = new AbortController();
    inFlight.current.set(threadKey, controller);
    const preceding = (threadsRef.current[threadKey]?.messages ?? []).filter((item) => item.id !== retryId && !item.failed);
    const history = buildConversationHistory(preceding.map((item) => ({ ...item, outcomes: item.actions?.map((_, index) => results[`${threadKey}:${item.id}:${index}`]?.message ?? null) })));
    const id = retryId ?? crypto.randomUUID();
    updateThread(threadKey, (previous) => ({ ...previous, lastMessageChange: performance.now(), sending: true, error: null, retry: undefined,
      messages: [...previous.messages.filter((item) => item.id !== retryId), { id, role: "user", content: selection ? `${value}\n\n“${selection}”` : value }].slice(-60) as ChatMessage[],
    }));
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const draftText = chapterId ? getDraftText?.() : undefined;
      // Chapter length is no longer this panel's problem: the agent searches on
      // the server, so a long chapter is read there or not at all.
      const conversation = { ...(memory.thread ? { threadId: memory.thread.id } : {}), requestId: id, editionId, temporary: memory.temporary };
      const response = await fetch(agentic ? `/api/books/${bookId}/agent/run` : `/api/books/${bookId}/ai/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(agentic
          ? { tool, versionId: editionId, conversation, message: selection ? `${value}\n\nThe author has selected this passage:\n"""\n${selection}\n"""` : value }
          : { mode: "actions", tool, message: value, chapterId, selectedText: selection, history, conversation, ...(draftText !== undefined ? { draftText } : {}) }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "You’ve reached the conversation limit for this minute. Wait a moment, then retry."
        : response.status === 409 ? "This message is already being processed or this conversation changed. Reload saved history before trying again."
        : response.status === 503 ? "Your conversation could not be saved. Your message is kept below; retry after the service recovers."
        : response.status === 401 ? "Your session has ended. Sign in again to continue."
        : response.status === 404 ? "That chapter is no longer available. Open a current chapter and try again."
        : response.status === 400 ? "That request could not be used. Try a shorter, more specific message."
        : "Your specialist could not reply. Your message is kept below for retry.");
      const json = await response.json();
      if (agentic) {
        const messageId = typeof json.id === "string" ? json.id : crypto.randomUUID();
        if (typeof json.threadId === "string") memory.rememberReply(json.threadId, value);
        if (typeof json.planId === "string" && json.plan) {
          setPlans((previous) => ({ ...previous, [`${threadKey}:${messageId}`]: { planId: json.planId, plan: json.plan, stats: json.stats, stoppedBecause: typeof json.stoppedBecause === "string" ? json.stoppedBecause : undefined, state: {} } }));
        }
        updateThread(threadKey, (previous) => ({ ...previous, lastMessageChange: performance.now(), messages: [...previous.messages, {
          id: messageId, role: "assistant",
          content: typeof json.summary === "string" && json.summary.trim() ? json.summary : "I could not work that one out. Try asking for one change at a time.",
          persistence: typeof json.threadId === "string" ? "saved" : "temporary",
          historical: json.source === "history", source: json.source === "history" ? "history" : "llm",
        }] }));
        return;
      }
      const reply = agentReplySchema.parse({ content: json.content, actions: json.source === "llm" ? json.actions : [] });
      const context = contextSchema.parse(json.context);
      if (context.chapterId !== chapterId) throw new Error("The reply refers to a different chapter. Please ask again.");
      if (typeof json.threadId === "string" && json.persistence !== "temporary") memory.rememberReply(json.threadId, value);
      updateThread(threadKey, (previous) => ({ ...previous, lastMessageChange: performance.now(), messages: [...previous.messages, {
        id: typeof json.id === "string" ? json.id : crypto.randomUUID(), role: "assistant", content: reply.content,
        persistence: json.persistence === "saved" || json.persistence === "temporary" ? json.persistence : "failed",
        historical: json.source === "history", source: json.source === "history" ? "history" : json.source === "llm" ? "llm" : "template", failureReason: json.failureReason === "invalid_proposal" ? "invalid_proposal" : "unavailable", actions: reply.actions, context,
      }] }));
    } catch (error) {
      if (!mounted.current) return;
      updateThread(threadKey, (previous) => ({ ...previous, lastMessageChange: performance.now(),
        messages: previous.messages.map((item) => item.id === id ? { ...item, failed: true } : item),
        error: error instanceof Error && error.name !== "AbortError" ? error.message : "The reply took too long. Your message is ready to retry.",
        retry: { id, message: value, selectedText: selection, chapterId },
      }));
    } finally {
      clearTimeout(timeout);
      inFlight.current.delete(threadKey);
      updateThread(threadKey, (previous) => ({ ...previous, sending: false }));
    }
  }, [bookId, editionId, chapterId, tool, agentic, threadKey, getDraftText, updateThread, results, memory]);

  const handledRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!memory.ready || memory.pending || !pendingRequest || handledRequest.current === pendingRequest.id || inFlight.current.has(threadKey)) return;
    const prompt = ACTION_PROMPTS[pendingRequest.action];
    if (!prompt) return;
    handledRequest.current = pendingRequest.id;
    void send(prompt, pendingRequest.selectedText);
    onPendingRequestHandled?.();
  }, [pendingRequest, threadKey, thread.sending, send, onPendingRequestHandled, memory.ready, memory.pending]);
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [threadKey, thread.messages.length, thread.sending]);

  const execute = async (id: string, action: AgentAction, context: ProposalContext) => {
    if (busyActions.current.has(id) || results[id]?.message) return;
    busyActions.current.add(id);
    setResults((previous) => ({ ...previous, [id]: { pending: true } }));
    const controller = new AbortController();
    const requestKey = `proposal:${id}`;
    inFlight.current.set(requestKey, controller);
    const deadline = setTimeout(() => controller.abort(), 60_000);
    try {
      let result: ProposalState;
      if (action.kind === "pronunciation") {
        if (!chapterId || context.chapterId !== chapterId) throw new Error("Open the same chapter before previewing this pronunciation.");
        const response = await fetch(`/api/books/${bookId}/audiobook/preview`, { method: "POST", headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ chapterId, pronunciation: { word: action.word, spokenAs: action.spokenAs, sampleText: action.sampleText } }),
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error(response.status === 429 ? "Voice preview limit reached. Wait a minute and retry."
          : response.status === 409 ? "Save the current chapter before previewing this pronunciation, then retry."
          : "The corrected sample could not be generated. Your proposal is kept so you can retry.");
        const blob = await response.blob();
        if (!blob.size) throw new Error("The voice service returned an empty sample. Please retry.");
        if (!mounted.current) return;
        const audioUrl = URL.createObjectURL(blob);
        audioUrls.current.add(audioUrl);
        result = { audioUrl, message: "Sample ready. Listen before deciding." };
      } else if (action.kind === "marketing_draft") {
        await navigator.clipboard.writeText(action.copy);
        result = { message: "Draft copied. Nothing has been published." };
      } else {
        if (!onExecuteAction) throw new Error("Open this book in the author workspace to use this proposal.");
        result = await onExecuteAction(action, context);
      }
      if (mounted.current) setResults((previous) => ({ ...previous, [id]: result }));
    } catch (error) {
      if (mounted.current) setResults((previous) => ({ ...previous, [id]: { error: error instanceof Error && error.name !== "AbortError" ? error.message : "This action took too long. Please retry." } }));
    } finally { clearTimeout(deadline); inFlight.current.delete(requestKey); busyActions.current.delete(id); }
  };
  const applyPlan = async (key: string, selection: { stepIds: string[]; matchIds: string[] }) => {
    const requestKey = `plan:${key}`;
    if (inFlight.current.has(requestKey)) return;
    const entry = plans[key];
    if (!entry || entry.state.pending || entry.state.outcomes || entry.state.alreadyApplied || entry.state.expired || settledPlans.current.has(entry.planId)) return;
    const controller = new AbortController();
    inFlight.current.set(requestKey, controller);
    setPlans((previous) => {
      const current = previous[key];
      if (!current) return previous;
      return { ...previous, [key]: { ...current, state: { pending: true } } };
    });
    // Longer than a chat turn: this writes every approved chapter before it answers.
    const deadline = setTimeout(() => controller.abort(), 120_000);
    const showApplied = (state: PlanState, refresh: boolean) => {
      settledPlans.current.add(entry.planId);
      if (!mounted.current) return;
      setPlans((previous) => {
        const current = previous[key];
        if (!current || current.state.outcomes) return previous;
        return { ...previous, [key]: { ...current, state } };
      });
      if (refresh) onBookChanged?.();
    };
    try {
      const applyUrl = `/api/books/${bookId}/agent/apply`;
      const applyInit = {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ planId: entry.planId, ...selection }),
      };
      let response = await fetch(applyUrl, applyInit);
      let json: unknown = await response.json().catch(() => null);
      // 409 is the claim lock. The winner may still be writing, and refreshing
      // now would paint the chapter from before that write.
      if (response.status === 409 && !storedApplyResult(json)) {
        for (let attempt = 0; attempt < APPLIED_PLAN_RETRIES; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, APPLIED_PLAN_RETRY_MS));
          if (controller.signal.aborted || !mounted.current) return;
          response = await fetch(applyUrl, applyInit);
          json = await response.json().catch(() => null);
          if (response.status !== 409 || storedApplyResult(json)) break;
        }
      }
      if (response.status === 409) {
        const stored = storedApplyResult(json);
        showApplied(
          stored ? { outcomes: stored.outcomes, changed: stored.changed } : { alreadyApplied: true },
          !stored || wroteSomething(stored.outcomes, stored.changed),
        );
        return;
      }
      // 410 will never succeed on a retry: the positions were measured against
      // older chapter text. Leave the card without a Run button.
      if (response.status === 410) {
        settledPlans.current.add(entry.planId);
        if (mounted.current) setPlans((previous) => {
          const current = previous[key];
          if (!current || current.state.outcomes || current.state.alreadyApplied) return previous;
          return { ...previous, [key]: { ...current, state: {
            expired: true,
            error: applyMessage(json) ?? "This plan is too old to apply safely. Ask for a fresh one.",
          } } };
        });
        return;
      }
      if (!response.ok) {
        throw new Error(applyMessage(json)
          ?? (response.status === 429 ? "You’ve reached this minute’s limit. Wait a moment, then press Run again."
          : response.status === 401 ? "Your session has ended. Sign in again, then ask for a fresh plan."
          : "Your book was not changed. Ask for a fresh plan and try again."));
      }
      if (!mounted.current) return;
      // A cover-image step comes back deferred on purpose: generation has its own
      // route with a budget ceiling, and the server will not open a second spend
      // path to it. Running it here, through the panel that owns that route, is
      // what keeps the author's single approval meaning what it says — otherwise
      // they approve a plan and are then told to go and do part of it by hand.
      // Same validator the 409 replay path uses, rather than trusting the shape.
      const applied = storedApplyResult(json);
      const outcomes: PlanOutcome[] = await Promise.all((applied?.outcomes ?? []).map(async (outcome) => {
        if (outcome.status !== "deferred") return outcome;
        const step = entry.plan.steps.find((candidate) => candidate.id === outcome.stepId);
        if (step?.tool !== "generate_cover_image") return outcome;
        if (!onExecuteAction) return { ...outcome, detail: "Open this book in the author workspace to generate cover options." };
        try {
          const generated = await onExecuteAction(
            { kind: "cover_brief", prompt: step.prompt, style: step.style, reason: step.reason },
            { chapterId: null, chapterText: null },
          );
          return { ...outcome, status: "applied", detail: generated.message };
        } catch (error) {
          return { ...outcome, status: "failed", detail: error instanceof Error ? error.message : "Cover options could not be generated." };
        }
      }));
      showApplied({ outcomes, changed: applied?.changed ?? 0 }, wroteSomething(outcomes, applied?.changed ?? 0));
    } catch (error) {
      if (mounted.current) setPlans((previous) => {
        const current = previous[key];
        if (!current || current.state.outcomes || current.state.alreadyApplied || current.state.expired) return previous;
        return { ...previous, [key]: { ...current, state: {
          error: error instanceof Error && error.name !== "AbortError" ? error.message : "This took too long. Reload the chapter to see whether any of it was applied.",
        } } };
      });
    } finally { clearTimeout(deadline); inFlight.current.delete(requestKey); }
  };
  const submit = () => {
    if (!thread.draft.trim() || !memory.ready || memory.pending || inFlight.current.has(threadKey)) return;
    const value = thread.draft;
    updateThread(threadKey, (previous) => ({ ...previous, draft: "" }));
    void send(value);
  };
  return <div className={styles.panel} data-dock={variant === "dock"}>
    <header className={styles.header}>
      <AgentAvatar agent={persona.agent} size={48} />
      <div className={styles.identity}><h2>{agent.name}</h2><p>{persona.role}</p></div>
      {onClose && <button type="button" className={styles.close} onClick={onClose} aria-label="Close AI assistant"><X size={17} aria-hidden /></button>}
    </header>
    <div className={styles.context}>{bookTitle && <span><strong>Book</strong> {bookTitle}</span>}{editionLabel && <span><strong>Edition</strong> {editionLabel}</span>}<span><strong>{chapterId ? "Chapter" : "Scope"}</strong> {chapterTitle || (chapterId ? "Current chapter" : "Whole book")}</span></div>
    <MemoryControls key={threadKey} memory={memory} hasEdition={Boolean(editionId)} editionLabel={editionLabel} busy={thread.sending} transcript={thread.messages} onViewChange={(open) => setMemoryView({ key: threadKey, open })} />
    <div hidden={memoryOpen} ref={transcriptRef} role="log" aria-label={`Conversation with ${agent.name}`} aria-live="polite" className={styles.transcript}>
      {memory.ready && thread.messages.length === 0 && <div className={styles.welcome}>
        <div className={styles.portrait}><AgentAvatar agent={persona.agent} portrait /></div>
        <h3>Let’s work on it.</h3><p>{persona.greeting}</p>
        <div className={styles.prompts}>{persona.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => {
          updateThread(threadKey, (previous) => ({ ...previous, draft: prompt })); inputRef.current?.focus();
        }}><span>{prompt}</span><ArrowUpRight size={14} aria-hidden /></button>)}</div>
      </div>}
      {thread.messages.map((message) => {
        const planKey = `${threadKey}:${message.id}`;
        const planned = plans[planKey];
        return <div key={message.id} className={styles.turn} data-role={message.role}>
        {message.role === "assistant" && <div className={styles.byline}><AgentAvatar agent={persona.agent} size={26} /><span>{agent.name}</span></div>}
        <div className={styles.message}>{message.content}</div>
        {message.failed && <p className={styles.meta}>Delivery unconfirmed. Reload saved history or retry this message.</p>}
        {message.historical && message.role === "assistant" && <p className={styles.meta}>Saved conversation · ask for a fresh suggestion before applying changes.</p>}
        {message.persistence === "saved" && <p className={styles.meta}>Conversation saved</p>}
        {message.persistence === "failed" && <p className={styles.error} role="alert">This reply could not be saved. Copy any text you need before leaving.</p>}
        {message.source === "template" && <p className={styles.meta}>{message.failureReason === "invalid_proposal" ? "This suggestion failed validation. No changes were applied." : "The AI service is unavailable. This is general guidance, without changes to apply."}</p>}
        {message.context && message.actions?.map((action, index) => {
          const id = `${threadKey}:${message.id}:${index}`;
          return <AgentProposalCard key={id} action={action} state={results[id]} onExecute={() => { void execute(id, action, message.context!); }} />;
        })}
        {planned && <AgentPlanCard plan={planned.plan} stats={planned.stats} stoppedBecause={planned.stoppedBecause} state={planned.state}
          onApply={(selection) => { void applyPlan(planKey, selection); }}
          onDismiss={() => setPlans((previous) => { const next = { ...previous }; delete next[planKey]; return next; })} />}
      </div>;
      })}
      {thread.sending && <div className={styles.thinking}><AgentAvatar agent={persona.agent} size={28} /><span>{agent.name} is working on it<span aria-hidden>…</span></span></div>}
    </div>
    <div hidden={memoryOpen} className={styles.composer}>
      {thread.error && <div className={styles.error} role="alert"><p>{thread.error}</p>{thread.retry && thread.retry.chapterId === chapterId && <button type="button" disabled={thread.sending} onClick={() => {
        const retry = thread.retry!; void send(retry.message, retry.selectedText, retry.id);
      }}>Retry message</button>}</div>}
      <label htmlFor={inputId} className="sr-only">Message to {agent.name}</label>
      <textarea id={inputId} ref={inputRef} value={thread.draft} onChange={(event) => updateThread(threadKey, (previous) => ({ ...previous, draft: event.target.value }))}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
        placeholder={`Tell ${agent.name} what you’d like to change…`} maxLength={2000} rows={3} />
      <div className={styles.composerActions}><span><CornerDownLeft size={12} aria-hidden /> Ctrl / ⌘ + Enter</span><button type="button" onClick={submit} disabled={thread.sending || !memory.ready || memory.pending || !thread.draft.trim()} aria-label={`Send message to ${agent.name}`}><Send size={15} aria-hidden />Send</button></div>
      <p className={styles.disclosure}>AI suggestions can be wrong. Review each proposed change.</p>
    </div>
  </div>;
}
