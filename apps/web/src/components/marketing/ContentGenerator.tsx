"use client";

import { useMemo, useState } from "react";
import type { GeneratorOutput, ModuleState } from "@/lib/marketing/types";

const emptyMessage = "Add a campaign summary to generate marketing copy.";

export default function ContentGenerator({
  generators,
  state,
}: {
  generators: GeneratorOutput[];
  state: ModuleState;
}) {
  const initialOutputs = useMemo(() => {
    return generators.reduce<Record<string, string>>((acc, generator) => {
      acc[generator.id] = generator.sampleOutput;
      return acc;
    }, {});
  }, [generators]);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>(initialOutputs);

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
        Generator is offline. We will reconnect the AI service soon.
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
      {generators.map((generator) => (
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
              {outputs[generator.id] ?? generator.sampleOutput}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              // TODO: Replace with AI generation call and streaming updates.
              setOutputs((prev) => ({
                ...prev,
                [generator.id]: generator.sampleOutput,
              }));
            }}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD]"
          >
            Generate copy
          </button>
        </div>
      ))}
    </div>
  );
}
