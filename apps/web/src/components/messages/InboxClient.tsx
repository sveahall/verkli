"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/reader/PageHeader";
import Tabs from "@/components/reader/Tabs";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import { cn } from "@/lib/utils";

type MessagingRole = "author" | "reader";
type ConversationStatus = "request" | "accepted" | "blocked";

type ConversationSummary = {
  id: string;
  status: ConversationStatus;
  requesterId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  canAccept: boolean;
  otherUser: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    role: MessagingRole;
  };
  lastMessage: {
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
  } | null;
};

type MessageItem = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type ListResponse = {
  viewerId?: string;
  conversations?: ConversationSummary[];
  error?: string;
};

type DetailResponse = {
  viewerId?: string;
  conversation?: ConversationSummary;
  messages?: MessageItem[];
  error?: string;
};

type InboxClientProps = {
  mode: "author" | "reader";
  initialConversationId?: string | null;
};

const POLL_INTERVAL_MS = 5000;

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function InboxClient({ mode, initialConversationId = null }: InboxClientProps) {
  const toast = useToastHelpers();
  const isVisible = useDocumentVisible();

  const [activeTab, setActiveTab] = useState<"accepted" | "requests">("accepted");
  const [viewerId, setViewerId] = useState<string | null>(null);

  const [acceptedConversations, setAcceptedConversations] = useState<ConversationSummary[]>([]);
  const [requestConversations, setRequestConversations] = useState<ConversationSummary[]>([]);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId
  );
  const [selectedConversation, setSelectedConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);

  const [messageBody, setMessageBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);

  const refreshLists = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      refreshAbortRef.current?.abort();
      const controller = new AbortController();
      refreshAbortRef.current = controller;
      if (!silent) {
        setLoadingLists(true);
      }

      try {
        const [acceptedRes, requestsRes] = await Promise.all([
          fetch("/api/messages/inbox", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          }),
          fetch("/api/messages/requests", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          }),
        ]);

        const acceptedJson = (await acceptedRes.json().catch(() => ({}))) as ListResponse;
        const requestsJson = (await requestsRes.json().catch(() => ({}))) as ListResponse;

        if (!acceptedRes.ok) {
          throw new Error(resolveErrorMessage(acceptedJson.error));
        }
        if (!requestsRes.ok) {
          throw new Error(resolveErrorMessage(requestsJson.error));
        }

        setViewerId(acceptedJson.viewerId ?? requestsJson.viewerId ?? null);
        setAcceptedConversations(Array.isArray(acceptedJson.conversations) ? acceptedJson.conversations : []);
        setRequestConversations(Array.isArray(requestsJson.conversations) ? requestsJson.conversations : []);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : resolveErrorMessage(null);
        setError(message);
        if (!silent) {
          toast.error(message);
        }
      } finally {
        if (refreshAbortRef.current === controller) {
          refreshAbortRef.current = null;
        }
        if (!silent) {
          setLoadingLists(false);
        }
      }
    },
    [toast]
  );

  const loadConversation = useCallback(
    async (conversationId: string, opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      conversationAbortRef.current?.abort();
      const controller = new AbortController();
      conversationAbortRef.current = controller;
      if (!silent) {
        setLoadingConversation(true);
      }

      try {
        const res = await fetch(`/api/messages/conversations/${conversationId}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });

        const json = (await res.json().catch(() => ({}))) as DetailResponse;

        if (!res.ok) {
          if (res.status === 404) {
            setSelectedConversation(null);
            setMessages([]);
            return;
          }
          throw new Error(resolveErrorMessage(json.error));
        }

        setViewerId(json.viewerId ?? viewerId);
        setSelectedConversation(json.conversation ?? null);
        setMessages(Array.isArray(json.messages) ? json.messages : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : resolveErrorMessage(null);
        if (!silent) {
          toast.error(message);
        }
      } finally {
        if (conversationAbortRef.current === controller) {
          conversationAbortRef.current = null;
        }
        if (!silent) {
          setLoadingConversation(false);
        }
      }
    },
    [toast, viewerId]
  );

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    const allIds = new Set(
      [...acceptedConversations, ...requestConversations].map((conversation) => conversation.id)
    );

    if (selectedConversationId && allIds.has(selectedConversationId)) {
      return;
    }

    const primaryList = activeTab === "accepted" ? acceptedConversations : requestConversations;
    const secondaryList = activeTab === "accepted" ? requestConversations : acceptedConversations;
    const nextId = primaryList[0]?.id ?? secondaryList[0]?.id ?? null;

    setSelectedConversationId(nextId);
  }, [
    acceptedConversations,
    activeTab,
    requestConversations,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversation(null);
      setMessages([]);
      conversationAbortRef.current?.abort();
      conversationAbortRef.current = null;
      return;
    }

    void loadConversation(selectedConversationId);
  }, [loadConversation, selectedConversationId]);

  useEffect(() => {
    if (!isVisible) return;
    void refreshLists({ silent: true });
    if (selectedConversationId) {
      void loadConversation(selectedConversationId, { silent: true });
    }

    const timer = setInterval(() => {
      void refreshLists({ silent: true });
      if (selectedConversationId) {
        void loadConversation(selectedConversationId, { silent: true });
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isVisible, loadConversation, refreshLists, selectedConversationId]);

  useEffect(() => {
    return () => {
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
      conversationAbortRef.current?.abort();
      conversationAbortRef.current = null;
    };
  }, []);

  const tabItems = useMemo(
    () => [
      {
        id: "accepted",
        label: "Accepted",
        badge: String(acceptedConversations.length),
      },
      {
        id: "requests",
        label: "Requests",
        badge: String(requestConversations.length),
      },
    ],
    [acceptedConversations.length, requestConversations.length]
  );

  const activeConversations = activeTab === "accepted" ? acceptedConversations : requestConversations;
  const isPendingRequest = selectedConversation?.status === "request";
  const canSend =
    Boolean(selectedConversation) &&
    (selectedConversation?.status === "accepted" || selectedConversation?.requesterId === viewerId);

  const onSendMessage = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedConversation || !canSend) return;

      const body = messageBody.trim();
      if (!body) return;

      setSending(true);
      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            conversationId: selectedConversation.id,
            body,
          }),
        });

        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(resolveErrorMessage(json.error));
        }

        setMessageBody("");
        await Promise.all([
          refreshLists({ silent: true }),
          loadConversation(selectedConversation.id, { silent: true }),
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : resolveErrorMessage(null);
        toast.error(message);
      } finally {
        setSending(false);
      }
    },
    [canSend, loadConversation, messageBody, refreshLists, selectedConversation, toast]
  );

  const onAcceptRequest = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(`/api/messages/requests/${conversationId}/accept`, {
          method: "POST",
          credentials: "include",
        });

        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(resolveErrorMessage(json.error));
        }

        toast.success("Förfrågan accepterad.");
        setActiveTab("accepted");
        setSelectedConversationId(conversationId);
        await Promise.all([
          refreshLists({ silent: true }),
          loadConversation(conversationId, { silent: true }),
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : resolveErrorMessage(null);
        toast.error(message);
      }
    },
    [loadConversation, refreshLists, toast]
  );

  const onBlockUser = useCallback(
    async (targetUserId: string) => {
      try {
        const res = await fetch("/api/messages/block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetUserId }),
        });

        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(resolveErrorMessage(json.error));
        }

        toast.success("Användaren är blockerad.");

        if (selectedConversation?.otherUser.id === targetUserId) {
          setSelectedConversationId(null);
          setSelectedConversation(null);
          setMessages([]);
        }

        await refreshLists({ silent: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : resolveErrorMessage(null);
        toast.error(message);
      }
    },
    [refreshLists, selectedConversation, toast]
  );

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow={mode === "author" ? "Inbox" : "Messages"}
        title={mode === "author" ? "Author inbox" : "Reader messages"}
        description={
          mode === "author"
            ? "Hantera accepterade chattar och inkommande meddelandeförfrågningar."
            : "Följ dina chattar och se om förfrågningar har accepterats."
        }
        actions={
          mode === "reader" ? (
            <Link href="/reader/authors" className="btn-secondary">
              Hitta authors
            </Link>
          ) : (
            <Link href="/author/home" className="btn-secondary">
              Till dashboard
            </Link>
          )
        }
      />

      <Tabs
        items={tabItems}
        active={activeTab}
        onChange={(id) => setActiveTab(id === "requests" ? "requests" : "accepted")}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="card-base-subtle p-3 sm:p-4">
          {loadingLists ? (
            <p className="text-[13px] text-slate-500 dark:text-white/60">Laddar inkorg...</p>
          ) : activeConversations.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-white/60">
              {activeTab === "accepted"
                ? "Inga accepterade konversationer ännu."
                : "Inga meddelandeförfrågningar just nu."}
            </p>
          ) : (
            <div className="space-y-2">
              {activeConversations.map((conversation) => {
                const isSelected = selectedConversationId === conversation.id;
                const preview = conversation.lastMessage?.body?.trim() ||
                  (conversation.status === "request" ? "Väntar på första meddelande." : "Ingen meddelandehistorik ännu.");

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      isSelected
                        ? "border-slate-900 bg-slate-900/5 dark:border-white dark:bg-white/10"
                        : "border-slate-200/80 bg-white/80 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
                          {getInitials(conversation.otherUser.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                            {conversation.otherUser.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-white/60">
                            {conversation.otherUser.role === "author" ? "Author" : "Reader"}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-white/40">
                        {formatTime(conversation.lastMessageAt ?? conversation.updatedAt)}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-[12px] text-slate-600 dark:text-white/70">{preview}</p>

                    {activeTab === "requests" && conversation.canAccept ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAcceptRequest(conversation.id);
                          }}
                          className="btn-primary min-h-[36px] px-3 py-1.5 text-[12px]"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onBlockUser(conversation.otherUser.id);
                          }}
                          className="btn-secondary min-h-[36px] px-3 py-1.5 text-[12px]"
                        >
                          Block
                        </button>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="card-base-subtle flex min-h-[460px] flex-col p-4 sm:p-5">
          {!selectedConversation ? (
            <div className="empty-state-base my-auto">
              <p className="text-[14px] font-medium text-slate-800 dark:text-white">Välj en konversation</p>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60">
                När du väljer en konversation visas meddelanden här.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200/80 pb-3 dark:border-white/10">
                <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  {selectedConversation.otherUser.name}
                </p>
                <p className="text-[12px] text-slate-500 dark:text-white/60">
                  {selectedConversation.status === "accepted"
                    ? "Accepted"
                    : selectedConversation.canAccept
                      ? "Ny request"
                      : "Pending request"}
                </p>
              </div>

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {loadingConversation ? (
                  <p className="text-[13px] text-slate-500 dark:text-white/60">Laddar konversation...</p>
                ) : messages.length === 0 ? (
                  <p className="text-[13px] text-slate-500 dark:text-white/60">Inga meddelanden ännu.</p>
                ) : (
                  messages.map((message) => {
                    const isOwn = message.senderId === viewerId;
                    return (
                      <div
                        key={message.id}
                        className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3 py-2 text-[13px]",
                            isOwn
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                              : "border border-slate-200/80 bg-white text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-white"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              isOwn ? "text-white/70 dark:text-slate-700" : "text-slate-400 dark:text-white/50"
                            )}
                          >
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedConversation.status === "request" && selectedConversation.canAccept ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => void onAcceptRequest(selectedConversation.id)}
                    className="btn-primary"
                  >
                    Accept request
                  </button>
                  <button
                    type="button"
                    onClick={() => void onBlockUser(selectedConversation.otherUser.id)}
                    className="btn-secondary"
                  >
                    Block user
                  </button>
                </div>
              ) : null}

              {canSend ? (
                <form onSubmit={onSendMessage} className="mt-4 border-t border-slate-200/80 pt-3 dark:border-white/10">
                  <label htmlFor="dm-body" className="mb-2 block text-[12px] font-medium text-slate-600 dark:text-white/70">
                    Skriv meddelande
                  </label>
                  <div className="flex items-end gap-2">
                    <textarea
                      id="dm-body"
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Skriv ditt meddelande..."
                      className="input-base min-h-[88px] resize-y"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={sending || messageBody.trim().length === 0}
                      className="btn-primary mb-0.5"
                    >
                      {sending ? "Skickar..." : "Skicka"}
                    </button>
                  </div>
                </form>
              ) : isPendingRequest ? (
                <p className="mt-4 border-t border-slate-200/80 pt-3 text-[13px] text-slate-500 dark:border-white/10 dark:text-white/60">
                  {selectedConversation.requesterId === viewerId
                    ? "Din förfrågan väntar på att accepteras."
                    : "Acceptera förfrågan för att kunna svara."}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
