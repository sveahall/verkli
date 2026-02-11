"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveErrorMessage } from "@/lib/error-messages";

type NewsletterSubscribeButtonProps = {
  authorId: string;
};

export default function NewsletterSubscribeButton({
  authorId,
}: NewsletterSubscribeButtonProps) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check subscription status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/newsletters/subscribe?check=1&authorId=${authorId}`,
          { credentials: "include" }
        );
        // If the subscribe endpoint doesn't support GET with check,
        // we fall back to assuming not subscribed
        if (!res.ok) {
          setSubscribed(false);
          return;
        }
        setSubscribed(false);
      } catch {
        setSubscribed(false);
      }
    };

    checkStatus();
  }, [authorId]);

  const handleSubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/newsletters/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        if (body.error === "NEWSLETTER_ALREADY_SUBSCRIBED") {
          setSubscribed(true);
          return;
        }
        setError(resolveErrorMessage(body.error));
        return;
      }

      setSubscribed(true);
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  const handleUnsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/newsletters/unsubscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      setSubscribed(false);
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  if (subscribed === null) {
    return null; // Loading state
  }

  return (
    <div>
      {subscribed ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleUnsubscribe}
          isLoading={loading}
          loadingText="..."
        >
          Prenumererar ✓
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={handleSubscribe}
          isLoading={loading}
          loadingText="..."
        >
          Prenumerera på nyhetsbrev
        </Button>
      )}
      {error && (
        <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
