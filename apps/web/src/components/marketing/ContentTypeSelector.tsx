import type { ContentType } from "@/lib/marketing/types";

const CONTENT_TYPE_OPTIONS: Array<{
  value: ContentType;
  label: string;
  description: string;
}> = [
  {
    value: "launch_post",
    label: "Launch Post",
    description: "New release announcement copy.",
  },
  {
    value: "teaser",
    label: "Teaser",
    description: "Short hook to drive curiosity.",
  },
  {
    value: "quote_card",
    label: "Quote Card",
    description: "Highlight one memorable line.",
  },
];

type ContentTypeSelectorProps = {
  value: ContentType;
  onChange: (value: ContentType) => void;
};

export default function ContentTypeSelector({
  value,
  onChange,
}: ContentTypeSelectorProps) {
  return (
    <section className="card-base p-5">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Content Type</h2>
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Pick the asset style you want to generate.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {CONTENT_TYPE_OPTIONS.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/20"
              }`}
            >
              <p className="text-[13px] font-semibold">{option.label}</p>
              <p
                className={`mt-1 text-[12px] ${
                  isActive ? "text-white/80 dark:text-slate-700" : "text-slate-500 dark:text-white/50"
                }`}
              >
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
