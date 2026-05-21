"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SUPPORTED_LANGUAGE_CODES,
  getLanguageLabel,
  type SupportedLanguage,
} from "@/lib/languages";
import {
  CARD_HOVER,
  CARD_IDLE,
  CARD_SELECTED,
  CHANNEL_DAY_COLORS,
  CHANNELS,
  CONTENT_TYPES,
  FREQUENCY_OPTIONS,
  PRESSABLE,
  TEMPLATE_OPTIONS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type CampaignBook,
  type ChannelId,
  type ContentTemplate,
  type ContentTypeId,
  type PostFrequency,
  type WeekDay,
} from "./CampaignWizard.config";
import {
  TOTAL_STEPS,
  buildDefaultSchedule,
  createInitialState,
  type CampaignWizardState,
  type WizardStep,
} from "./CampaignWizard.state";

// ─── Progress bar ────────────────────────────────────────────────────────────

function WizardProgress({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-full transition-colors duration-300",
              i < step ? "bg-[#907AFF]" : "bg-black/[0.06] dark:bg-white/10"
            )}
          />
        ))}
      </div>
      <span className="text-[12px] font-medium text-slate-400 dark:text-white/35">
        {step}/{totalSteps}
      </span>
    </div>
  );
}

// ─── Step 1: Select book ─────────────────────────────────────────────────────

function StepSelectBook({
  books,
  selectedBookId,
  onSelect,
}: {
  books: CampaignBook[];
  selectedBookId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          Which book do you want to promote?
        </h3>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
          Choose the book this campaign will be about.
        </p>
      </div>

      <div className="grid gap-2.5">
        {books.map((book) => {
          const isSelected = book.id === selectedBookId;
          return (
            <button
              key={book.id}
              type="button"
              onClick={() => onSelect(book.id)}
              className={cn(
                "flex items-center gap-3.5 rounded-2xl border px-5 py-4 text-left",
                PRESSABLE,
                isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
              )}
            >
              {book.cover_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.cover_image} alt="" className="h-12 w-8 rounded-lg object-cover shadow-sm" />
              ) : (
                <div className="flex h-12 w-8 items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/10">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400 dark:text-white/30">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "truncate text-[15px] font-medium",
                  isSelected ? "text-[#6C5CE7] dark:text-[#A99AFF]" : "text-slate-900 dark:text-white"
                )}>
                  {book.title ?? "Untitled book"}
                </p>
              </div>
              {isSelected && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-white">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Languages ───────────────────────────────────────────────────────

function StepLanguages({
  languages,
  onToggle,
}: {
  languages: Set<SupportedLanguage>;
  onToggle: (lang: SupportedLanguage) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          Which languages do you want to publish in?
        </h3>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
          Each post is regenerated for every language you pick.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SUPPORTED_LANGUAGE_CODES.map((code) => {
          const isSelected = languages.has(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => onToggle(code)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[14px] font-medium",
                PRESSABLE,
                isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
              )}
            >
              <span className="block text-[12px] uppercase tracking-wider text-slate-400 dark:text-white/35">
                {code}
              </span>
              <span className={cn(
                isSelected ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-white/70"
              )}>
                {getLanguageLabel(code)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Content types ───────────────────────────────────────────────────

function StepContentTypes({
  contentTypes,
  onToggle,
}: {
  contentTypes: Set<ContentTypeId>;
  onToggle: (id: ContentTypeId) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          What kind of content should we generate?
        </h3>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
          Pick at least one. Trailers and podcast clips are generated on demand.
        </p>
      </div>
      <div className="grid gap-2.5">
        {CONTENT_TYPES.map((opt) => {
          const isSelected = contentTypes.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={cn(
                "flex items-start gap-3.5 rounded-2xl border px-5 py-4 text-left",
                PRESSABLE,
                isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
              )}
            >
              <span className="text-[24px] leading-none">{opt.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[15px] font-medium",
                  isSelected ? "text-slate-900 dark:text-white" : "text-slate-800 dark:text-white/80"
                )}>
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/45">
                  {opt.description}
                </p>
              </div>
              {isSelected && (
                <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-white">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Channels + frequency ────────────────────────────────────────────

function StepChannels({
  channels,
  frequency,
  onToggleChannel,
  onToggleAll,
  onSetFrequency,
}: {
  channels: Set<ChannelId>;
  frequency: PostFrequency | null;
  onToggleChannel: (id: ChannelId) => void;
  onToggleAll: () => void;
  onSetFrequency: (freq: PostFrequency) => void;
}) {
  const allSelected = CHANNELS.every((ch) => channels.has(ch.id));

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
              Where do you want to publish?
            </h3>
            <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
              You can select multiple platforms
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-slate-500 dark:text-white/50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              className="h-4 w-4 rounded border-black/20 text-[#907AFF] accent-[#907AFF] dark:border-white/20"
            />
            Select all
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {CHANNELS.map((channel) => {
            const isSelected = channels.has(channel.id);
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onToggleChannel(channel.id)}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-4",
                  PRESSABLE,
                  isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center">
                  {channel.icon}
                </span>
                <span className={cn(
                  "text-[13px] font-medium",
                  isSelected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-white/60"
                )}>
                  {channel.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          How often do you want to post per week?
        </h3>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {FREQUENCY_OPTIONS.map((opt) => {
            const isSelected = frequency === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSetFrequency(opt.value)}
                className={cn(
                  "rounded-full border px-5 py-2.5 text-[14px] font-medium",
                  PRESSABLE,
                  isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Schedule ────────────────────────────────────────────────────────

function StepSchedule({
  channels,
  startDate,
  template,
  schedule,
  onSetStartDate,
  onSetTemplate,
  onToggleDayChannel,
}: {
  channels: Set<ChannelId>;
  startDate: string;
  template: ContentTemplate;
  schedule: Map<WeekDay, ChannelId[]>;
  onSetStartDate: (date: string) => void;
  onSetTemplate: (t: ContentTemplate) => void;
  onToggleDayChannel: (day: WeekDay, channel: ChannelId) => void;
}) {
  const channelList = CHANNELS.filter((ch) => channels.has(ch.id));
  const [activeChannelTab, setActiveChannelTab] = useState<ChannelId | "all">("all");

  const startDateObj = new Date(startDate + "T00:00:00");
  const formattedDate = startDateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      {/* 1. Starting date */}
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-[12px] font-bold text-white">
          1
        </span>
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Start date
          </h3>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
            Choose when your content schedule should begin
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onSetStartDate(e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-black/[0.02] px-3 text-[14px] text-slate-700 outline-none transition-all focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
            />
            <span className="text-[13px] text-slate-500 dark:text-white/50">
              {formattedDate}
            </span>
          </div>
        </div>
      </div>

      <div className="ml-[42px] border-t border-black/[0.06] dark:border-white/[0.06]" />

      {/* 2. Template */}
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-[12px] font-bold text-white">
          2
        </span>
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Choose a weekly template
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATE_OPTIONS.map((opt) => {
              const isSelected = template === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSetTemplate(opt.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-[13px] font-medium",
                    PRESSABLE,
                    isSelected ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ml-[42px] border-t border-black/[0.06] dark:border-white/[0.06]" />

      {/* 3. Weekly schedule */}
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-[12px] font-bold text-white">
          3
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Weekly schedule
          </h3>

          {channelList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveChannelTab("all")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[12px] font-medium",
                  PRESSABLE,
                  activeChannelTab === "all" ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
                )}
              >
                All
              </button>
              {channelList.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannelTab(ch.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium",
                    PRESSABLE,
                    activeChannelTab === ch.id ? CARD_SELECTED : `${CARD_IDLE} ${CARD_HOVER}`
                  )}
                >
                  <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                    {ch.icon}
                  </span>
                  {ch.label}
                </button>
              ))}
            </div>
          )}

          {/* Calendar grid */}
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((day) => (
              <div key={day} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
                {WEEKDAY_LABELS[day]}
              </div>
            ))}
            {WEEKDAYS.map((day) => {
              const dayChannels = schedule.get(day) ?? [];
              const visibleChannels =
                activeChannelTab === "all"
                  ? dayChannels
                  : dayChannels.filter((ch) => ch === activeChannelTab);
              const hasContent = visibleChannels.length > 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (activeChannelTab !== "all") {
                      onToggleDayChannel(day, activeChannelTab);
                    } else if (channelList.length > 0) {
                      onToggleDayChannel(day, channelList[0].id);
                    }
                  }}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-xl border transition-all duration-150 active:scale-[0.96]",
                    hasContent
                      ? "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
                      : "border-dashed border-black/[0.08] hover:border-[#907AFF]/30 dark:border-white/[0.06]"
                  )}
                >
                  {visibleChannels.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-1">
                      {visibleChannels.map((chId) => (
                        <span key={chId} className={cn("h-2.5 w-2.5 rounded-full", CHANNEL_DAY_COLORS[chId])} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 dark:text-white/15">+</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export type CampaignWizardCompleteConfig = {
  bookId: string;
  languages: SupportedLanguage[];
  contentTypes: ContentTypeId[];
  channels: ChannelId[];
  frequency: PostFrequency;
  startDate: string;
  template: ContentTemplate;
  schedule: Record<string, string[]>;
};

type CampaignWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: CampaignBook[];
  initialBookId?: string | null;
  onComplete?: (config: CampaignWizardCompleteConfig) => void | Promise<void>;
};

export default function CampaignWizard({
  open,
  onOpenChange,
  books,
  initialBookId = null,
  onComplete,
}: CampaignWizardProps) {
  // Track open count via ref to remount inner component on each open.
  // Avoids setState-in-effect which the React compiler rejects.
  const openCountRef = useRef(0);
  const prevOpenRef = useRef(false);
  const subscribe = useCallback((cb: () => void) => {
    // No external store; we just re-render when props change.
    void cb;
    return () => {};
  }, []);
  const openCount = useSyncExternalStore(
    subscribe,
    () => {
      if (open && !prevOpenRef.current) {
        prevOpenRef.current = true;
        openCountRef.current += 1;
      }
      if (!open) prevOpenRef.current = false;
      return openCountRef.current;
    },
    () => openCountRef.current
  );

  if (!open) return null;

  return (
    <CampaignWizardInner
      key={openCount}
      onClose={() => onOpenChange(false)}
      books={books}
      initialBookId={initialBookId}
      onComplete={onComplete}
    />
  );
}

function CampaignWizardInner({
  onClose,
  books,
  initialBookId = null,
  onComplete,
}: {
  onClose: () => void;
  books: CampaignBook[];
  initialBookId?: string | null;
  onComplete?: CampaignWizardProps["onComplete"];
}) {
  const startBookId = initialBookId ?? books[0]?.id ?? null;
  const startBook = books.find((b) => b.id === startBookId) ?? books[0] ?? null;
  const startLang = (startBook?.language ?? "en") as SupportedLanguage;
  const [state, setState] = useState<CampaignWizardState>(() =>
    createInitialState(startBookId, SUPPORTED_LANGUAGE_CODES.includes(startLang) ? startLang : "en")
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const canAdvance = useMemo(() => {
    switch (state.step) {
      case 1:
        return Boolean(state.selectedBookId);
      case 2:
        return state.languages.size > 0;
      case 3:
        return state.contentTypes.size > 0;
      case 4:
        return state.channels.size > 0 && state.frequency !== null;
      case 5:
        return true;
      default:
        return false;
    }
  }, [
    state.step,
    state.selectedBookId,
    state.languages.size,
    state.contentTypes.size,
    state.channels.size,
    state.frequency,
  ]);

  const goNext = useCallback(() => {
    setState((prev) => {
      if (prev.step === 4) {
        const schedule = buildDefaultSchedule(prev.channels, prev.frequency);
        return { ...prev, step: 5 as WizardStep, schedule };
      }
      if (prev.step < TOTAL_STEPS) {
        return { ...prev, step: (prev.step + 1) as WizardStep };
      }
      return prev;
    });
  }, []);

  const goBack = useCallback(() => {
    setState((prev) =>
      prev.step > 1 ? { ...prev, step: (prev.step - 1) as WizardStep } : prev
    );
  }, []);

  const toggleLanguage = useCallback((lang: SupportedLanguage) => {
    setState((prev) => {
      const next = new Set(prev.languages);
      if (next.has(lang)) {
        if (next.size === 1) return prev;
        next.delete(lang);
      } else {
        next.add(lang);
      }
      return { ...prev, languages: next };
    });
  }, []);

  const toggleContentType = useCallback((id: ContentTypeId) => {
    setState((prev) => {
      const next = new Set(prev.contentTypes);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, contentTypes: next };
    });
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    // Wait for exit animation before unmounting
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const handleComplete = useCallback(async () => {
    if (!state.selectedBookId || !state.frequency) return;

    const scheduleObj: Record<string, string[]> = {};
    state.schedule.forEach((chs, day) => {
      scheduleObj[day] = chs;
    });

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onComplete?.({
        bookId: state.selectedBookId,
        languages: [...state.languages],
        contentTypes: [...state.contentTypes],
        channels: [...state.channels],
        frequency: state.frequency,
        startDate: state.startDate,
        template: state.template,
        schedule: scheduleObj,
      });
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create campaign.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [state, onComplete, close]);

  const toggleChannel = useCallback((id: ChannelId) => {
    setState((prev) => {
      const next = new Set(prev.channels);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, channels: next };
    });
  }, []);

  const toggleAllChannels = useCallback(() => {
    setState((prev) => {
      const allSelected = CHANNELS.every((ch) => prev.channels.has(ch.id));
      const next = allSelected
        ? new Set<ChannelId>()
        : new Set<ChannelId>(CHANNELS.map((ch) => ch.id));
      return { ...prev, channels: next };
    });
  }, []);

  const toggleDayChannel = useCallback((day: WeekDay, channel: ChannelId) => {
    setState((prev) => {
      const nextSchedule = new Map(prev.schedule);
      const dayChannels = [...(nextSchedule.get(day) ?? [])];
      const idx = dayChannels.indexOf(channel);
      if (idx >= 0) dayChannels.splice(idx, 1);
      else dayChannels.push(channel);
      nextSchedule.set(day, dayChannels);
      return { ...prev, schedule: nextSchedule };
    });
  }, []);

  const isLastStep = state.step === TOTAL_STEPS;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1000] flex items-center justify-center p-4 transition-colors duration-200",
        visible ? "bg-black/50 backdrop-blur-sm" : "bg-black/0"
      )}
      onClick={close}
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      role="button"
      tabIndex={-1}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        className={cn(
          "relative w-full max-w-[620px] rounded-3xl border border-black/10 bg-white/95 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-[#0a0a0f]/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]",
          visible
            ? "scale-100 opacity-100"
            : "scale-[0.97] opacity-0"
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={close}
          className="absolute right-6 top-6 text-slate-400 transition-colors hover:text-slate-900 active:scale-[0.92] dark:text-white/40 dark:hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <h2 className="text-[22px] font-semibold text-slate-900 dark:text-white">
          Create campaign
        </h2>

        {/* Progress */}
        <div className="mt-5">
          <WizardProgress step={state.step} totalSteps={TOTAL_STEPS} />
        </div>

        {/* Step content */}
        <div className="mt-7">
          {state.step === 1 && (
            <StepSelectBook
              books={books}
              selectedBookId={state.selectedBookId}
              onSelect={(id) => setState((prev) => ({ ...prev, selectedBookId: id }))}
            />
          )}

          {state.step === 2 && (
            <StepLanguages
              languages={state.languages}
              onToggle={toggleLanguage}
            />
          )}

          {state.step === 3 && (
            <StepContentTypes
              contentTypes={state.contentTypes}
              onToggle={toggleContentType}
            />
          )}

          {state.step === 4 && (
            <StepChannels
              channels={state.channels}
              frequency={state.frequency}
              onToggleChannel={toggleChannel}
              onToggleAll={toggleAllChannels}
              onSetFrequency={(freq) =>
                setState((prev) => ({ ...prev, frequency: freq }))
              }
            />
          )}

          {state.step === 5 && (
            <StepSchedule
              channels={state.channels}
              startDate={state.startDate}
              template={state.template}
              schedule={state.schedule}
              onSetStartDate={(date) =>
                setState((prev) => ({ ...prev, startDate: date }))
              }
              onSetTemplate={(t) =>
                setState((prev) => ({ ...prev, template: t }))
              }
              onToggleDayChannel={toggleDayChannel}
            />
          )}
        </div>

        {submitError && (
          <p className="mt-4 text-[13px] text-red-600 dark:text-red-400">
            {submitError}
          </p>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={state.step === 1 ? close : goBack}
            disabled={submitting}
            className={cn(
              "rounded-xl border px-6 py-2.5 text-[14px] font-medium transition-all disabled:opacity-50",
              PRESSABLE,
              CARD_IDLE
            )}
          >
            {state.step === 1 ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            onClick={isLastStep ? handleComplete : goNext}
            disabled={!canAdvance || submitting}
            className={cn(
              "rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE] disabled:opacity-50",
              PRESSABLE
            )}
          >
            {submitting
              ? "Creating…"
              : isLastStep
                ? "Create campaign"
                : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
