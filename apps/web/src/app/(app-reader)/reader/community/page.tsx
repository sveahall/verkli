import Link from "next/link";

import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

const communities = [
  {
    id: "coastal-mystery",
    name: "Coastal Mystery Club",
    members: "14.2k members",
    description: "Weekly chapter discussions and seaside thrillers.",
  },
  {
    id: "soft-lit",
    name: "Soft-lit Romance",
    members: "9.5k members",
    description: "Slow-burn stories and cozy recommendations.",
  },
];

const discussions = [
  {
    id: "discussion-1",
    title: "Best winter reads for long commutes?",
    author: "Hannah L.",
    replies: "42 replies",
    time: "5h ago",
  },
  {
    id: "discussion-2",
    title: "Midnight Atlas: The map theory thread",
    author: "Reader collective",
    replies: "128 replies",
    time: "Yesterday",
  },
  {
    id: "discussion-3",
    title: "Looking for calm sci-fi with heart",
    author: "Miko",
    replies: "19 replies",
    time: "2 days ago",
  },
];

export default function ReaderCommunityPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Community"
        title="Reader communities"
        subtitle="Join discussions, share recommendations, and follow the conversations around your favorite stories."
        actions={
          <Link
            href="/reader/discover"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            Explore genres
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Your communities</h2>
        {communities.length === 0 ? (
          <EmptyState
            title="No communities yet"
            description="Join a club to see updates and member discussions here."
            action={
              <Link
                href="/reader/discover"
                className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Discover communities
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {communities.map((community) => (
              <div
                key={community.id}
                className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                    {community.name}
                  </h3>
                  <span className="text-[12px] text-slate-500 dark:text-white/50">{community.members}</span>
                </div>
                <p className="mt-2 text-[14px] text-slate-600 dark:text-white/70">{community.description}</p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex min-h-[36px] items-center rounded-full bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                  >
                    Open room
                  </button>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-slate-400 hover:text-slate-600 dark:text-white/45 dark:hover:text-white/65"
                  >
                    Leave
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Trending discussions</h2>
        <div className="grid gap-4">
          {discussions.map((discussion) => (
            <div
              key={discussion.id}
              className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] text-slate-500 dark:text-white/50">{discussion.author}</span>
                <span className="text-[12px] text-slate-400 dark:text-white/40">{discussion.time}</span>
              </div>
              <h3 className="mt-2 text-[15px] font-semibold text-slate-900 dark:text-white">
                {discussion.title}
              </h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55">{discussion.replies}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
