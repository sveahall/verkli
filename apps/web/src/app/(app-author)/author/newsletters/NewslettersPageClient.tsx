"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import NewsletterList from "@/components/newsletters/NewsletterList";
import EmptyState from "@/components/reader/EmptyState";
import { resolveErrorMessage } from "@/lib/error-messages";

type NewsletterItem = {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
};

type NewslettersPageClientProps = {
  newsletters: NewsletterItem[];
  subscriberCount: number;
};

export default function NewslettersPageClient({
  newsletters,
  subscriberCount,
}: NewslettersPageClientProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/newsletters", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Nytt nyhetsbrev",
          bodyHtml: "",
          bodyText: "",
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        newsletter?: { id: string };
      };

      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      if (body.newsletter?.id) {
        router.push(`/author/newsletters/${body.newsletter.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setCreating(false);
    }
  }, [router]);

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Nyhetsbrev"
        title="Nyhetsbrev"
        description={`Skicka nyhetsbrev till dina prenumeranter. ${subscriberCount} aktiva prenumeranter.`}
        actions={
          <Button
            onClick={handleCreate}
            isLoading={creating}
            loadingText="Skapar..."
          >
            Nytt nyhetsbrev
          </Button>
        }
      />

      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}

      {newsletters.length === 0 ? (
        <EmptyState
          title="Inga nyhetsbrev ännu"
          description="Skapa ditt första nyhetsbrev för att nå dina prenumeranter."
          action={
            <Button
              onClick={handleCreate}
              isLoading={creating}
              loadingText="Skapar..."
            >
              Skapa nyhetsbrev
            </Button>
          }
        />
      ) : (
        <NewsletterList newsletters={newsletters} />
      )}
    </div>
  );
}
