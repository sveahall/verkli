"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CornerDownLeft, Send, X } from "lucide-react";
import { z } from "zod";
import AgentAvatar from "@/features/ai-team/AgentAvatar";
import { getAgent } from "@/features/ai-team/agents";
import { agentConversations, conversationTool } from "@/features/ai-team/agent-conversations";
import { buildConversationHistory } from "@/features/ai-team/actions/conversation-history";
import AgentProposalCard, { type ProposalState } from "@/features/ai-team/actions/AgentProposalCard";
import type { ExecuteAgentAction, ProposalContext } from "@/features/ai-team/actions/editor-action";
import { agentReplySchema, type AgentAction } from "@/lib/ai/agent-actions";
import styles from "@/features/ai-team/AgentConversation.module.css";
import type { Tool } from "../bookEditor.shared";
import type { InlineAiAction } from "@/features/book-workspace/types";

export type PendingAiRequest = { id: string; action: InlineAiAction; selectedText: string };
export type AiAssistantPanelProps = {
  bookId: string; chapterId: string | null; chapterTitle?: string | null;
  pendingRequest?: PendingAiRequest | null; onPendingRequestHandled?: () => void;
  variant?: "page" | "dock"; onClose?: () => void; activeTool?: Tool;
  getDraftText?: () => string | undefined;
  onExecuteAction?: ExecuteAgentAction;
};
type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string;
  source?: "llm" | "template"; failureReason?: "invalid_proposal" | "unavailable"; failed?: boolean; actions?: AgentAction[]; context?: ProposalContext;
};
type Retry = { id: string; message: string; selectedText: string | null; chapterId: string | null };
type Thread = { messages: ChatMessage[]; draft: string; sending: boolean; error: string | null; retry?: Retry };
const emptyThread = (): Thread => ({ messages: [], draft: "", sending: false, error: null });
const contextSchema = z.object({ chapterId: z.string().nullable(), chapterText: z.string().nullable() });
const ACTION_PROMPTS: Partial<Record<InlineAiAction, string>> = {
  rewrite: "Suggest a rewrite of this passage. Keep the meaning and my voice.",
  pacing: "Suggest a precise edit to improve the pacing of this passage.",
  expand: "Suggest an expanded version of this passage with more detail.",
};

export default function AiAssistantPanel({ bookId, chapterId, chapterTitle, variant = "page", onClose,
  activeTool = "edit", pendingRequest, onPendingRequestHandled, getDraftText, onExecuteAction,
}: AiAssistantPanelProps) {
  const tool = conversationTool(activeTool);
  const persona = agentConversations[tool];
  const agent = getAgent(persona.agent);
  const threadKey = `${bookId}:${tool}`;
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const threadsRef = useRef(threads);
  const thread = threads[threadKey] ?? emptyThread();
  const [results, setResults] = useState<Record<string, ProposalState>>({});
  const busyActions = useRef(new Set<string>());
  const inFlight = useRef(new Map<string, AbortController>());
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

  const send = useCallback(async (message: string, selectedText: string | null = null, retryId?: string) => {
    const value = message.trim();
    if (!value || inFlight.current.has(threadKey)) return;
    const selection = selectedText?.slice(0, 2000) || null;
    const controller = new AbortController();
    inFlight.current.set(threadKey, controller);
    const preceding = (threadsRef.current[threadKey]?.messages ?? []).filter((item) => item.id !== retryId && !item.failed);
    const history = buildConversationHistory(preceding.map((item) => ({ ...item, outcomes: item.actions?.map((_, index) => results[`${threadKey}:${item.id}:${index}`]?.message ?? null) })));
    const id = retryId ?? crypto.randomUUID();
    updateThread(threadKey, (previous) => ({ ...previous, sending: true, error: null, retry: undefined,
      messages: [...previous.messages.filter((item) => item.id !== retryId), { id, role: "user", content: selection ? `${value}\n\n“${selection}”` : value }].slice(-60) as ChatMessage[],
    }));
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const draftText = chapterId ? getDraftText?.() : undefined;
      if (draftText && draftText.length > 60_000) throw new Error("This chapter is too long for a safe editing suggestion. Split it into smaller chapters first.");
      const response = await fetch(`/api/books/${bookId}/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ mode: "actions", tool, message: value, chapterId, selectedText: selection, history, ...(draftText !== undefined ? { draftText } : {}) }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "You’ve reached the conversation limit for this minute. Wait a moment, then retry."
        : response.status === 401 ? "Your session has ended. Sign in again to continue."
        : response.status === 404 ? "That chapter is no longer available. Open a current chapter and try again."
        : response.status === 400 ? "That request could not be used. Try a shorter, more specific message."
        : "Your specialist could not reply. Your message is kept below for retry.");
      const json = await response.json();
      const reply = agentReplySchema.parse({ content: json.content, actions: json.source === "llm" ? json.actions : [] });
      const context = contextSchema.parse(json.context);
      if (context.chapterId !== chapterId) throw new Error("The reply refers to a different chapter. Please ask again.");
      updateThread(threadKey, (previous) => ({ ...previous, messages: [...previous.messages, {
        id: crypto.randomUUID(), role: "assistant", content: reply.content,
        source: json.source === "llm" ? "llm" : "template", failureReason: json.failureReason === "invalid_proposal" ? "invalid_proposal" : "unavailable", actions: reply.actions, context,
      }] }));
    } catch (error) {
      if (!mounted.current) return;
      updateThread(threadKey, (previous) => ({ ...previous,
        messages: previous.messages.map((item) => item.id === id ? { ...item, failed: true } : item),
        error: error instanceof Error && error.name !== "AbortError" ? error.message : "The reply took too long. Your message is ready to retry.",
        retry: { id, message: value, selectedText: selection, chapterId },
      }));
    } finally {
      clearTimeout(timeout);
      inFlight.current.delete(threadKey);
      updateThread(threadKey, (previous) => ({ ...previous, sending: false }));
    }
  }, [bookId, chapterId, tool, threadKey, getDraftText, updateThread, results]);

  const handledRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingRequest || handledRequest.current === pendingRequest.id || inFlight.current.has(threadKey)) return;
    const prompt = ACTION_PROMPTS[pendingRequest.action];
    if (!prompt) return;
    handledRequest.current = pendingRequest.id;
    void send(prompt, pendingRequest.selectedText);
    onPendingRequestHandled?.();
  }, [pendingRequest, threadKey, thread.sending, send, onPendingRequestHandled]);
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
  const submit = () => {
    if (!thread.draft.trim() || inFlight.current.has(threadKey)) return;
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
    <div className={styles.context}><span className={styles.contextDot} aria-hidden />{chapterTitle ? `Working with ${chapterTitle}` : chapterId ? "Working with your current chapter" : "Book conversation"}</div>
    <div ref={transcriptRef} role="log" aria-label={`Conversation with ${agent.name}`} aria-live="polite" className={styles.transcript}>
      {thread.messages.length === 0 && <div className={styles.welcome}>
        <div className={styles.portrait}><AgentAvatar agent={persona.agent} portrait /></div>
        <h3>Let’s work on it.</h3><p>{persona.greeting}</p>
        <div className={styles.prompts}>{persona.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => {
          updateThread(threadKey, (previous) => ({ ...previous, draft: prompt })); inputRef.current?.focus();
        }}><span>{prompt}</span><ArrowUpRight size={14} aria-hidden /></button>)}</div>
      </div>}
      {thread.messages.map((message) => <div key={message.id} className={styles.turn} data-role={message.role}>
        {message.role === "assistant" && <div className={styles.byline}><AgentAvatar agent={persona.agent} size={26} /><span>{agent.name}</span></div>}
        <div className={styles.message}>{message.content}</div>
        {message.failed && <p className={styles.meta}>Not sent. You can retry below.</p>}
        {message.source === "template" && <p className={styles.meta}>{message.failureReason === "invalid_proposal" ? "This suggestion failed validation. No changes were applied." : "The AI service is unavailable. This is general guidance, without changes to apply."}</p>}
        {message.context && message.actions?.map((action, index) => {
          const id = `${threadKey}:${message.id}:${index}`;
          return <AgentProposalCard key={id} action={action} state={results[id]} onExecute={() => { void execute(id, action, message.context!); }} />;
        })}
      </div>)}
      {thread.sending && <div className={styles.thinking}><AgentAvatar agent={persona.agent} size={28} /><span>{agent.name} is working on it<span aria-hidden>…</span></span></div>}
    </div>
    <div className={styles.composer}>
      {thread.error && <div className={styles.error} role="alert"><p>{thread.error}</p>{thread.retry && thread.retry.chapterId === chapterId && <button type="button" disabled={thread.sending} onClick={() => {
        const retry = thread.retry!; void send(retry.message, retry.selectedText, retry.id);
      }}>Retry message</button>}</div>}
      <label htmlFor={inputId} className="sr-only">Message to {agent.name}</label>
      <textarea id={inputId} ref={inputRef} value={thread.draft} onChange={(event) => updateThread(threadKey, (previous) => ({ ...previous, draft: event.target.value }))}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
        placeholder={`Tell ${agent.name} what you’d like to change…`} maxLength={2000} rows={3} />
      <div className={styles.composerActions}><span><CornerDownLeft size={12} aria-hidden /> Ctrl / ⌘ + Enter</span><button type="button" onClick={submit} disabled={thread.sending || !thread.draft.trim()} aria-label={`Send message to ${agent.name}`}><Send size={15} aria-hidden />Send</button></div>
      <p className={styles.disclosure}>AI suggestions can be wrong. Review each proposed change.</p>
    </div>
  </div>;
}
