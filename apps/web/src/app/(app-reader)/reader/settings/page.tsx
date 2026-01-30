import Link from "next/link";

import PageHeader from "@/components/reader/PageHeader";

const settingsGroups = [
  {
    title: "Reading",
    description: "Adjust typography, theme, and reading behavior.",
    items: ["Font size", "Theme", "Auto-scroll"],
  },
  {
    title: "Notifications",
    description: "Stay updated on authors and releases.",
    items: ["New chapters", "Community replies", "Weekly digest"],
  },
  {
    title: "Account",
    description: "Manage profile, privacy, and membership.",
    items: ["Profile info", "Privacy", "Membership"],
  },
];

export default function ReaderSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Reader settings"
        subtitle="Tune how you read, what you get notified about, and how your profile appears."
        actions={
          <Link
            href="/reader/profile"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            Back to profile
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {settingsGroups.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5"
          >
            <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
              {group.title}
            </h3>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60">{group.description}</p>
            <div className="mt-4 space-y-2">
              {group.items.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-[13px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                >
                  <span>{item}</span>
                  <span className="text-[11px] text-slate-400 dark:text-white/40">Placeholder</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
