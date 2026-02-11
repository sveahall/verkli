"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { resolveErrorMessage } from "@/lib/error-messages";

type CreateClubDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export default function CreateClubDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateClubDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxMembers, setMaxMembers] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setIsPublic(true);
    setMaxMembers(50);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/book-clubs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            is_public: isPublic,
            max_members: maxMembers,
          }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!res.ok) {
          setError(resolveErrorMessage(body.error));
          return;
        }

        reset();
        onOpenChange(false);
        onCreated();
      } catch {
        setError(resolveErrorMessage(null));
      } finally {
        setLoading(false);
      }
    },
    [name, description, isPublic, maxMembers, reset, onOpenChange, onCreated]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Skapa bokklubb</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && (
            <p className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="club-name"
              className="text-[13px] font-medium text-slate-700 dark:text-white/70"
            >
              Namn
            </label>
            <input
              id="club-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Stockholms fantasy-klubb"
              className="min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="club-desc"
              className="text-[13px] font-medium text-slate-700 dark:text-white/70"
            >
              Beskrivning (valfritt)
            </label>
            <textarea
              id="club-desc"
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Berätta kort om klubben..."
              className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="club-public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-[#907AFF]/40 dark:border-white/20 dark:bg-white/10"
            />
            <label
              htmlFor="club-public"
              className="text-[13px] text-slate-700 dark:text-white/70"
            >
              Offentlig klubb (synlig för alla)
            </label>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="club-max"
              className="text-[13px] font-medium text-slate-700 dark:text-white/70"
            >
              Max antal medlemmar
            </label>
            <select
              id="club-max"
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
          <Button
            type="submit"
            isLoading={loading}
            loadingText="Skapar..."
            disabled={!name.trim()}
          >
            Skapa
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
