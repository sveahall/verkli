"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";

type FollowAuthorButtonProps = {
  authorId: string;
  isSignedIn: boolean;
  signInHref: string;
  initialFollowing: boolean;
};

export default function FollowAuthorButton({
  authorId,
  isSignedIn,
  signInHref,
  initialFollowing,
}: FollowAuthorButtonProps) {
  const toast = useToastHelpers();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [isPending, setIsPending] = useState(false);

  if (!isSignedIn) {
    return (
      <Link
        href={signInHref}
        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15"
      >
        Logga in för att följa
      </Link>
    );
  }

  const toggleFollow = async () => {
    setIsPending(true);
    try {
      if (isFollowing) {
        const response = await fetch(
          `/api/follows?followeeId=${encodeURIComponent(authorId)}`,
          { method: "DELETE" }
        );
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          toast.error(resolveErrorMessage(payload.error, "Kunde inte sluta följa."));
          return;
        }
        setIsFollowing(false);
        toast.success("Du följer inte längre författaren.");
        return;
      }

      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followeeId: authorId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(resolveErrorMessage(payload.error, "Kunde inte följa författaren."));
        return;
      }

      setIsFollowing(true);
      toast.success("Du följer nu författaren.");
    } catch {
      toast.error("Nätverksfel. Försök igen.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant={isFollowing ? "secondary" : "primary"}
      size="sm"
      isLoading={isPending}
      loadingText={isFollowing ? "Tar bort..." : "Följer..."}
      onClick={toggleFollow}
      aria-pressed={isFollowing}
    >
      {isFollowing ? "Följer" : "Följ"}
    </Button>
  );
}
