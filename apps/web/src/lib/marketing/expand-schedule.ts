import type {
  CampaignPlanChannel,
  CampaignPlanContentType,
  CampaignPlanTemplate,
  CampaignPlanWeekday,
} from "./schemas";

const WEEKDAY_TO_INDEX: Record<CampaignPlanWeekday, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};

const POSTING_HOUR_BY_CHANNEL: Record<CampaignPlanChannel, number> = {
  instagram: 11,
  tiktok: 19,
  youtube: 17,
  facebook: 12,
  x: 14,
  threads: 16,
};

export type ExpandPlanInput = {
  startDate: string; // YYYY-MM-DD
  durationWeeks: number;
  weeklySchedule: Record<string, string[]>;
  languages: string[];
  contentTypes: CampaignPlanContentType[];
  template: CampaignPlanTemplate;
};

export type ExpandedPost = {
  scheduledFor: Date;
  channel: CampaignPlanChannel;
  language: string;
  contentType: CampaignPlanContentType;
  variantIndex: number;
};

const VALID_CHANNELS: ReadonlySet<string> = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "threads",
]);

function isWeekday(s: string): s is CampaignPlanWeekday {
  return s === "mon" || s === "tue" || s === "wed" || s === "thu" || s === "fri" || s === "sat" || s === "sun";
}

function isContentType(s: string): s is CampaignPlanContentType {
  return s === "text" || s === "trailer" || s === "podcast";
}

/**
 * Expand a campaign plan into a list of post-shaped objects. Generates one
 * post per (scheduled day × channel × language × content_type) combination.
 *
 * Iteration order: scheduled day → channel on that day → language → content_type
 *
 * variantIndex increments globally so caption variants rotate across the run.
 */
export function expandSchedule(input: ExpandPlanInput): ExpandedPost[] {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];

  const totalDays = Math.max(1, input.durationWeeks * 7);
  const out: ExpandedPost[] = [];
  let variantIndex = 0;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const utcDay = date.getUTCDay();

    // Find weekday key matching this date
    const weekdayKey = (Object.entries(WEEKDAY_TO_INDEX).find(
      ([, idx]) => idx === utcDay
    )?.[0] ?? "mon") as CampaignPlanWeekday;

    if (!isWeekday(weekdayKey)) continue;

    const channels = (input.weeklySchedule[weekdayKey] ?? []).filter((c) =>
      VALID_CHANNELS.has(c)
    ) as CampaignPlanChannel[];

    if (channels.length === 0) continue;

    for (const channel of channels) {
      const hour = POSTING_HOUR_BY_CHANNEL[channel] ?? 12;
      const scheduledFor = new Date(date);
      scheduledFor.setUTCHours(hour, 0, 0, 0);

      for (const language of input.languages) {
        for (const ctRaw of input.contentTypes) {
          if (!isContentType(ctRaw)) continue;
          out.push({
            scheduledFor,
            channel,
            language,
            contentType: ctRaw,
            variantIndex,
          });
          variantIndex++;
        }
      }
    }
  }

  return out;
}
