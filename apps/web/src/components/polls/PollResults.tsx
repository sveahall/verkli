"use client";

import { Card } from "@/components/ui/card";

type PollResultItem = {
  option_id: string;
  text: string;
  count: number;
};

type PollResultsProps = {
  question: string;
  results: PollResultItem[];
  total: number;
};

export default function PollResults({ question, results, total }: PollResultsProps) {
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
        {question}
      </h3>
      <div className="mt-4 space-y-3">
        {results.map((r) => {
          const pct = total > 0 ? (r.count / total) * 100 : 0;
          return (
            <div key={r.option_id} className="space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-700 dark:text-white/80">
                  {r.text}
                </span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {r.count} ({Math.round(pct)}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all duration-500 dark:bg-white"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-slate-400 dark:text-white/40">
        Totalt {total} {total === 1 ? "röst" : "röster"}
      </p>
    </Card>
  );
}
