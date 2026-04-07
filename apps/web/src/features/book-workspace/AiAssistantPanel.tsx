"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BookWorkspaceChapter,
  WriteInlineAiEventDetail,
} from "@/features/book-workspace/types";
import { WRITE_INLINE_AI_EVENT } from "@/features/book-workspace/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiAssistantPanelProps = {
  bookTitle: string;
  bookId: string;
  activeLanguage: string;
  selectedChapter: BookWorkspaceChapter | null;
  chapters: BookWorkspaceChapter[];
  totalBookWordCount: number;
  onOpenProduction: (kind: "audiobook" | "translation") => void;
  onOpenAudience: () => void;
  onOpenAnalytics: () => void;
};

const quickActions = [
  { label: "Rewrite", prompt: "Rewrite the selected text to be more concise" },
  { label: "Improve pacing", prompt: "How can I improve the pacing of this section?" },
  { label: "Expand scene", prompt: "How can I expand this scene with more detail?" },
  { label: "Fix dialogue", prompt: "How can I improve the dialogue here?" },
];

export default function AiAssistantPanel({
  bookTitle,
  bookId,
  activeLanguage,
  selectedChapter,
}: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [isApiAvailable, setIsApiAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleInlineAiEvent = (event: Event) => {
      const detail = (event as CustomEvent<WriteInlineAiEventDetail>).detail;
      if (!detail) return;
      setSelectedText(detail.selectedText);
    };

    window.addEventListener(WRITE_INLINE_AI_EVENT, handleInlineAiEvent as EventListener);
    return () => {
      window.removeEventListener(WRITE_INLINE_AI_EVENT, handleInlineAiEvent as EventListener);
    };
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/books/${bookId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          chapterId: selectedChapter?.id ?? null,
          selectedText: selectedText || null,
          history: messages,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          setIsApiAvailable(false);
        }
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: data.id,
        role: "assistant",
        content: data.content,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setIsApiAvailable(false);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "AI chat is being set up. For now, select text in the editor to use quick actions.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    const fullPrompt = selectedText
      ? `${prompt}:\n\n"${selectedText}"`
      : prompt;
    sendMessage(fullPrompt);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-12rem)] flex-col">
      <div className="border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
          AI Writing Assistant
        </p>
        <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
          {selectedChapter?.title || bookTitle}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
          {activeLanguage.toUpperCase()} • {selectedChapter ? "Chapter" : "Book"} context
        </p>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <p className="text-sm text-slate-500 dark:text-white/45 mb-6">
              Ask me anything about your writing
            </p>
            <div className="w-full space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={isLoading}
                  className="w-full rounded-2xl border border-[#907AFF]/30 bg-white/40 px-4 py-2.5 text-sm font-medium text-[#907AFF] transition hover:bg-white/60 hover:border-[#907AFF] dark:bg-white/[0.05] dark:hover:bg-white/10 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-slate-900 text-white dark:bg-slate-800"
                  : "bg-white text-slate-900 dark:bg-white/5 dark:text-white/90"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-900 dark:bg-white/5 dark:text-white/90 rounded-2xl px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-current rounded-full animate-bounce animation-delay-100" />
                <div className="w-2 h-2 bg-current rounded-full animate-bounce animation-delay-200" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {selectedText && (
        <div className="border-t border-slate-200/70 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#907AFF] mb-2">
            Selection
          </p>
          <p className="line-clamp-2 text-xs text-slate-600 dark:text-white/70">
            {selectedText}
          </p>
        </div>
      )}

      <div className="border-t border-slate-200/70 p-4 dark:border-white/10">
        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isLoading) {
                e.preventDefault();
                sendMessage(inputValue);
              }
            }}
            placeholder="Ask about your writing..."
            disabled={isLoading || !isApiAvailable}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm placeholder-slate-400 focus:border-[#907AFF] focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40 disabled:opacity-50"
            rows={3}
          />
          <button
            onClick={() => sendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim() || !isApiAvailable}
            className="self-end rounded-2xl bg-[#907AFF] px-4 py-3 text-white transition hover:bg-[#907AFF]/90 disabled:opacity-50 dark:hover:bg-[#907AFF]/80"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 5l7 7m0 0l-7 7m7-7H6"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
