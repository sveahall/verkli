// Pure state helpers for CampaignWizard — initial-state builder and the
// default-schedule derivation. Kept React-free so the logic is easy to test
// in node-env without dragging in the wizard UI.

import type { SupportedLanguage } from "@/lib/languages";

import {
  WEEKDAYS,
  type ChannelId,
  type ContentTemplate,
  type ContentTypeId,
  type PostFrequency,
  type WeekDay,
} from "./CampaignWizard.config";

export const TOTAL_STEPS = 5;
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type CampaignWizardState = {
  step: WizardStep;
  selectedBookId: string | null;
  languages: Set<SupportedLanguage>;
  contentTypes: Set<ContentTypeId>;
  channels: Set<ChannelId>;
  frequency: PostFrequency | null;
  startDate: string;
  template: ContentTemplate;
  schedule: Map<WeekDay, ChannelId[]>;
};

export function createInitialState(
  bookId: string | null,
  bookLanguage: SupportedLanguage = "en"
): CampaignWizardState {
  const today = new Date();
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  const dateStr = nextMonday.toISOString().slice(0, 10);

  return {
    step: 1,
    selectedBookId: bookId,
    languages: new Set([bookLanguage]),
    contentTypes: new Set<ContentTypeId>(["text"]),
    channels: new Set(),
    frequency: null,
    startDate: dateStr,
    template: "launch",
    schedule: new Map(),
  };
}

/**
 * Distribute the selected channels across the first N weekdays based on
 * frequency: 1–3 → 3 days, 4–5 → 5 days, 6+ → 7 days. Channels are
 * round-robined so they take turns rather than stacking on the same day.
 *
 * Pure — no side effects, deterministic given the same inputs.
 */
export function buildDefaultSchedule(
  channels: Set<ChannelId>,
  frequency: PostFrequency | null
): Map<WeekDay, ChannelId[]> {
  const schedule = new Map<WeekDay, ChannelId[]>();
  WEEKDAYS.forEach((day) => schedule.set(day, []));

  const channelList = [...channels];
  if (channelList.length === 0 || !frequency) return schedule;

  const postsPerWeek = frequency === "1-3" ? 3 : frequency === "4-5" ? 5 : 7;
  const activeDays = WEEKDAYS.slice(0, Math.min(postsPerWeek, 7));

  activeDays.forEach((day, dayIndex) => {
    const channelForDay = channelList[dayIndex % channelList.length];
    schedule.set(day, [channelForDay]);
  });

  return schedule;
}
