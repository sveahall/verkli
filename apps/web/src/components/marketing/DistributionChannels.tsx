"use client";

import type { DistributionChannel, ModuleState } from "@/lib/marketing/types";

export default function DistributionChannels({
  channels,
  state,
  onToggle,
}: {
  channels: DistributionChannel[];
  state: ModuleState;
  onToggle: (id: string) => void;
}) {
  if (state === "loading") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[72px] rounded-2xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        Channels couldn&apos;t be loaded. Try again later.
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        No channels configured yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-background p-4"
        >
          <div>
            <p className="text-[15px] font-semibold text-foreground">{channel.label}</p>
            <p className="text-[12px] text-muted-foreground">{channel.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onToggle(channel.id)}
            className={`flex w-[74px] items-center rounded-full border px-1.5 py-1 transition ${
              channel.enabled
                ? "border-[#907AFF]/40 bg-[#907AFF]/20"
                : "border-border bg-muted/40"
            }`}
            role="switch"
            aria-checked={channel.enabled}
          >
            <span
              className={`h-6 w-6 rounded-full bg-white shadow transition ${
                channel.enabled ? "translate-x-[34px]" : "translate-x-0"
              }`}
            />
            <span className="sr-only">Toggle {channel.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
