"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveErrorMessage } from "@/lib/error-messages";

type ChatMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ClubChatProps = {
  clubId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
};

export default function ClubChat({
  clubId,
  initialMessages,
  currentUserId,
}: ClubChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/book-clubs/${clubId}/messages`, {
          credentials: "include",
        });
        if (res.ok) {
          const body = (await res.json()) as { messages: ChatMessage[] };
          setMessages(body.messages);
        }
      } catch {
        // silent poll failure
      }
    };

    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [clubId]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if (!content) return;

      setSending(true);
      setError(null);

      try {
        const res = await fetch(`/api/book-clubs/${clubId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: ChatMessage;
        };

        if (!res.ok) {
          setError(resolveErrorMessage(body.error));
          return;
        }

        if (body.message) {
          setMessages((prev) => [...prev, body.message as ChatMessage]);
        }
        setDraft("");
      } catch {
        setError(resolveErrorMessage(null));
      } finally {
        setSending(false);
      }
    },
    [clubId, draft]
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/5">
      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[13px] text-slate-400 dark:text-white/40">
            Inga meddelanden ännu. Starta konversationen!
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.user_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-[14px] ${
                  isOwn
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    isOwn
                      ? "text-white/60 dark:text-slate-500"
                      : "text-slate-400 dark:text-white/40"
                  }`}
                >
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-slate-200/80 p-3 dark:border-white/10"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Skriv ett meddelande..."
          maxLength={2000}
          className="min-h-[44px] flex-1 rounded-full border border-slate-200/80 bg-white/90 px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!draft.trim()}
          isLoading={sending}
          loadingText="..."
        >
          Skicka
        </Button>
      </form>
      {error && (
        <p className="px-4 pb-3 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
