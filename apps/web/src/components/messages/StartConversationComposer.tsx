"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";

type StartConversationComposerProps = {
  recipientId: string;
  recipientName: string;
};

type CreateConversationResponse = {
  conversation?: {
    id: string;
    status: "request" | "accepted" | "blocked";
    requesterId: string;
  };
  error?: string;
};

export default function StartConversationComposer({
  recipientId,
  recipientName,
}: StartConversationComposerProps) {
  const router = useRouter();
  const toast = useToastHelpers();

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = message.trim();
    if (!body) return;

    setSubmitting(true);

    try {
      const createRes = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientId }),
      });

      const createJson = (await createRes.json().catch(() => ({}))) as CreateConversationResponse;

      if (!createRes.ok || !createJson.conversation?.id) {
        throw new Error(resolveErrorMessage(createJson.error));
      }

      const sendRes = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conversationId: createJson.conversation.id,
          body,
        }),
      });

      const sendJson = (await sendRes.json().catch(() => ({}))) as { error?: string };
      if (!sendRes.ok) {
        throw new Error(resolveErrorMessage(sendJson.error));
      }

      setMessage("");

      if (createJson.conversation.status === "request") {
        toast.success("Meddelandeförfrågan skickad.");
      } else {
        toast.success("Meddelande skickat.");
      }

      router.push(`/reader/inbox?conversation=${createJson.conversation.id}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : resolveErrorMessage(null);
      toast.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card-base-subtle mt-4 space-y-3 p-4">
      <div>
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Skicka ett direktmeddelande till {recipientName}
        </p>
        <p className="mt-1 text-[12px] text-slate-500 dark:text-white/60">
          Ditt första meddelande skickas som request om författaren behöver godkänna.
        </p>
      </div>

      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={2000}
        rows={3}
        className="input-base min-h-[88px] resize-y"
        placeholder="Skriv ett kort meddelande..."
        disabled={submitting}
      />

      <button
        type="submit"
        disabled={submitting || message.trim().length === 0}
        className="btn-primary"
      >
        {submitting ? "Skickar..." : "Skicka meddelande"}
      </button>
    </form>
  );
}
