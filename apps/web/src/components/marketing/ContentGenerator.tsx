"use client";

import { useCallback, useMemo, useState } from "react";
import type { GeneratorOutput, ModuleState } from "@/lib/marketing/types";

const emptyMessage = "Choose a campaign to generate marketing copy.";

const CONTENT_TYPE_MAP: Record<string, string> = {
  hook: "hook",
  blurb: "blurb",
  social: "caption",
};

export default function ContentGenerator({
  generators,
  state,
  bookId,
}: {
  generators: GeneratorOutput[];
  state: ModuleState;
  bookId?: string | null;
}) {
  const initialOutputs = useMemo(() => {
    return generators.reduce<Record<string, string>>((acc, generator) => {
      acc[generator.id] = generator.sampleOutput;
      return acc;
    }, {});
  }, [generators]);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>(initialOutputs);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleGenerate = useCallback(
    async (generatorId: string) => {
      if (!bookId) {
        setErrors((prev) => ({ ...prev, [generatorId]: "Choose a book first." }));
        return;
      }

      setLoading((prev) => ({ ...prev, [generatorId]: true }));
      setErrors((prev) => ({ ...prev, [generatorId]: "" }));

      try {
        const res = await fetch("/api/marketing/caption/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId,
            contentType: CONTENT_TYPE_MAP[generatorId] ?? "caption",
            channel: "instagram",
            tone: inputs[generatorId] || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setErrors((prev) => ({
            ...prev,
            [generatorId]: data?.error ?? "Generation failed",
          }));
          return;
        }

        const data = await res.json();
        setOutputs((prev) => ({
          ...prev,
          [generatorId]: data.caption ?? "No result.",
        }));
      } catch {
        setErrors((prev) => ({
          ...prev,
          [generatorId]: "Network error. Try again.",
        }));
      } finally {
        setLoading((prev) => ({ ...prev, [generatorId]: false }));
      }
    },
    [bookId, inputs]
  );

  if (state === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-[200px] rounded-2xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        We couldn&apos;t load the generator. Try again in a moment.
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {generators.map((generator) => {
        const isLoading = loading[generator.id] ?? false;
        const error = errors[generator.id] ?? "";

        return (
          <div key={generator.id} className="rounded-2xl border border-border bg-background p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-foreground">{generator.label}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Draft copy in seconds. Edit before publishing.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                Beta
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <textarea
                value={inputs[generator.id] ?? ""}
                onChange={(event) =>
                  setInputs((prev) => ({ ...prev, [generator.id]: event.target.value }))
                }
                placeholder={generator.placeholder}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-[#907AFF]/60 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/30"
              />
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                {isLoading
                  ? "Generating..."
                  : outputs[generator.id] || "Result appears here."}
              </div>
              {error && (
                <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleGenerate(generator.id)}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD] disabled:cursor-not-allowed disabled:opacity-60"
          >
              {isLoading ? "Generating..." : "Generate copy"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
