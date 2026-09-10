"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/reader/PageHeader";
import Tabs from "@/components/reader/Tabs";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import { cn } from "@/lib/utils";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

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

// Realtime drives live updates (<1s). Polling stays as a fallback for flaky
// connections; interval is long because realtime handles the common case.
const POLL_INTERVAL_MS = 30000;
// Debounce realtime bursts so a flood of INSERTs triggers a single refresh.
const REALTIME_REFRESH_DEBOUNCE_MS = 250;

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
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

  // Supabase Realtime: subscribe to message + conversation changes so the inbox
  // updates instantly. RLS scopes events to rows this user can see, so we can
  // listen broadly and rely on the server filter. Falls back to polling above.
  useEffect(() => {
    if (!viewerId) return;

    const supabase = createSupabaseBrowserClient();
    let debounceListsTimer: ReturnType<typeof setTimeout> | null = null;
    let debounceConversationTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleListsRefresh = () => {
      if (debounceListsTimer) return;
      debounceListsTimer = setTimeout(() => {
        debounceListsTimer = null;
        void refreshLists({ silent: true });
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };
    const scheduleConversationRefresh = (conversationId: string | null) => {
      if (!conversationId) return;
      if (debounceConversationTimer) return;
      debounceConversationTimer = setTimeout(() => {
        debounceConversationTimer = null;
        void loadConversation(conversationId, { silent: true });
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`inbox:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const conversationId =
            (payload.new as { conversation_id?: string } | null)?.conversation_id ?? null;
          scheduleListsRefresh();
          if (conversationId && conversationId === selectedConversationId) {
            scheduleConversationRefresh(conversationId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          scheduleListsRefresh();
          if (selectedConversationId) {
            scheduleConversationRefresh(selectedConversationId);
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceListsTimer) clearTimeout(debounceListsTimer);
      if (debounceConversationTimer) clearTimeout(debounceConversationTimer);
      void supabase.removeChannel(channel);
    };
  }, [viewerId, selectedConversationId, refreshLists, loadConversation]);

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

        toast.success("Request accepted.");
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

        toast.success("User blocked.");

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
            ? "Manage accepted chats and incoming message requests."
            : "Track your chats and see when requests are accepted."
        }
        actions={
          mode === "reader" ? (
            <Link href="/reader/authors" className="btn-secondary">
              Find authors
            </Link>
          ) : (
            <Link href="/author/home" className="btn-secondary">
              Back to dashboard
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

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="card-base-subtle p-3 sm:p-4">
          {loadingLists ? (
            <p className="text-[13px] text-muted-foreground">Loading inbox...</p>
          ) : activeConversations.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {activeTab === "accepted"
                ? "No accepted conversations yet."
                : "No message requests right now."}
            </p>
          ) : (
            <div className="space-y-2">
              {activeConversations.map((conversation) => {
                const isSelected = selectedConversationId === conversation.id;
                const preview = conversation.lastMessage?.body?.trim() ||
                  (conversation.status === "request" ? "Waiting for the first message." : "No message history yet.");

                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      "w-full rounded-2xl border p-3 text-left transition-colors",
                      isSelected
                        ? "border-accent-foreground/25 bg-accent"
                        : "border-border bg-card/80 hover:border-border dark:bg-card dark:hover:border-border"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      aria-pressed={isSelected}
                      className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-white dark:text-background">
                            {getInitials(conversation.otherUser.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {conversation.otherUser.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {conversation.otherUser.role === "author" ? "Author" : "Reader"}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatTime(conversation.lastMessageAt ?? conversation.updatedAt)}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-[12px] text-muted-foreground">{preview}</p>
                    </button>

                    {activeTab === "requests" && conversation.canAccept ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAcceptRequest(conversation.id);
                          }}
                          className="btn-primary min-h-[44px] px-3 py-1.5 text-[12px]"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onBlockUser(conversation.otherUser.id);
                          }}
                          className="btn-secondary min-h-[44px] px-3 py-1.5 text-[12px]"
                        >
                          Block
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <section className="card-base-subtle flex min-h-[460px] flex-col p-4 sm:p-5">
          {!selectedConversation ? (
            <div className="empty-state-base my-auto">
              <p className="text-[14px] font-medium text-foreground">Select a conversation</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Messages will appear here when you select a conversation.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border pb-3">
                <p className="text-[15px] font-semibold text-foreground">
                  {selectedConversation.otherUser.name}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {selectedConversation.status === "accepted"
                    ? "Accepted"
                    : selectedConversation.canAccept
                      ? "New request"
                      : "Awaiting request"}
                </p>
              </div>

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {loadingConversation ? (
                  <p className="text-[13px] text-muted-foreground">Loading conversation...</p>
                ) : messages.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No messages yet.</p>
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
                              ? "bg-foreground text-white dark:text-background"
                              : "border border-border bg-card text-foreground "
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              isOwn ? "text-background/75" : "text-muted-foreground"
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
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
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
                <form onSubmit={onSendMessage} className="mt-4 border-t border-border pt-3">
                  <label htmlFor="dm-body" className="mb-2 block text-[12px] font-medium text-muted-foreground">
                    Write a message
                  </label>
                  <div className="flex items-end gap-2">
                    <textarea
                      id="dm-body"
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Write your message..."
                      className="input-base min-h-[88px] resize-y"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={sending || messageBody.trim().length === 0}
                      className="btn-primary mb-0.5"
                    >
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </form>
              ) : isPendingRequest ? (
                <p className="mt-4 border-t border-border pt-3 text-[13px] text-muted-foreground">
                  {selectedConversation.requesterId === viewerId
                    ? "Your request is waiting to be accepted."
                    : "Accept the request to reply."}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
