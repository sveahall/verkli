"use client";

type Subscriber = {
  id: string;
  userId: string;
  subscribedAt: string;
  status: string;
  profile: {
    name: string;
    username: string | null;
    avatarUrl: string | null;
  };
};

type SubscriberListProps = {
  subscribers: Subscriber[];
};

export default function SubscriberList({ subscribers }: SubscriberListProps) {
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (subscribers.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-slate-400 dark:text-white/40">
        Inga prenumeranter ännu
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/10">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
            <th className="px-4 py-3 font-medium text-slate-500 dark:text-white/50">
              Namn
            </th>
            <th className="hidden px-4 py-3 font-medium text-slate-500 dark:text-white/50 sm:table-cell">
              Prenumererat sedan
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 dark:text-white/50">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((sub) => (
            <tr
              key={sub.id}
              className="border-b border-slate-100 last:border-0 dark:border-white/5"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-white/60">
                    {sub.profile.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {sub.profile.name}
                  </span>
                </div>
              </td>
              <td className="hidden px-4 py-3 text-slate-500 dark:text-white/50 sm:table-cell">
                {formatDate(sub.subscribedAt)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                  Aktiv
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
