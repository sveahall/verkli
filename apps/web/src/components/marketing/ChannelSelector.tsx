import type { Channel } from "@/lib/marketing/types";

const CHANNEL_OPTIONS: Array<{
  value: Channel;
  label: string;
}> = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
];

type ChannelSelectorProps = {
  value: Channel;
  onChange: (value: Channel) => void;
};

export default function ChannelSelector({ value, onChange }: ChannelSelectorProps) {
  return (
    <section className="card-base p-5">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Platform</h2>
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Where will this asset be published?
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNEL_OPTIONS.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/20"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
