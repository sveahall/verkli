"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type CampaignBook = {
  id: string;
  title: string | null;
  cover_image: string | null;
};

type ChannelId =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "x"
  | "threads";

type PostFrequency = "1-3" | "4-5" | "6+";

type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const WEEKDAY_LABELS: Record<WeekDay, string> = {
  mon: "Mån",
  tue: "Tis",
  wed: "Ons",
  thu: "Tor",
  fri: "Fre",
  sat: "Lör",
  sun: "Sön",
};

const WEEKDAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type ContentTemplate = "custom" | "launch" | "engagement" | "awareness";

const TEMPLATE_OPTIONS: { value: ContentTemplate; label: string }[] = [
  { value: "custom", label: "Anpassad" },
  { value: "launch", label: "Bokrelease" },
  { value: "engagement", label: "Läsarengagemang" },
  { value: "awareness", label: "Synlighet" },
];

// ─── Shared interactive styles (matching app design tokens) ──────────────────

const CARD_IDLE =
  "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]";
const CARD_HOVER =
  "hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]";
const CARD_SELECTED =
  "border-[#907AFF]/40 bg-[#907AFF]/[0.06] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/[0.08]";
const PRESSABLE = "active:scale-[0.98] transition-all duration-150";

// ─── Channel config ──────────────────────────────────────────────────────────

type ChannelConfig = {
  id: ChannelId;
  label: string;
  icon: React.ReactNode;
};

function InstagramIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-grad)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="url(#ig-grad)" strokeWidth="1.5" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-grad)" />
      <defs>
        <linearGradient id="ig-grad" x1="2" y1="22" x2="22" y2="2">
          <stop stopColor="#F58529" />
          <stop offset="0.5" stopColor="#DD2A7B" />
          <stop offset="1" stopColor="#8134AF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M9 12a4 4 0 1 0 4 4V4c.5 2.5 3 4 5 4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="4" stroke="#FF0000" strokeWidth="1.5" />
      <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FF0000" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z" stroke="#1877F2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M4 4L10.5 12.5L4 20H6L11.5 13.5L16 20H20L13 11L19 4H17L12 10L8 4H4Z" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 21a9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 8.5 6M15 10c-1-1-2.5-1.5-4-1a3.5 3.5 0 0 0-2 3c0 2 1.5 3.5 3.5 3.5s3.5-1 4-3c.3-1.3 0-3-1-4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

const CHANNELS: ChannelConfig[] = [
  { id: "instagram", label: "Instagram", icon: <InstagramIcon /> },
  { id: "tiktok", label: "TikTok", icon: <TikTokIcon /> },
  { id: "youtube", label: "YouTube", icon: <YouTubeIcon /> },
  { id: "facebook", label: "Facebook", icon: <FacebookIcon /> },
  { id: "x", label: "X/Twitter", icon: <XIcon /> },
  { id: "threads", label: "Threads", icon: <ThreadsIcon /> },
];

const FREQUENCY_OPTIONS: { value: PostFrequency; label: string }[] = [
  { value: "1-3", label: "1–3 gånger" },
  { value: "4-5", label: "4–5 gånger" },
  { value: "6+", label: "6+ gånger" },
];

const CHANNEL_DAY_COLORS: Record<ChannelId, string> = {
  instagram: "bg-pink-300 dark:bg-pink-500/50",
  tiktok: "bg-slate-400 dark:bg-white/40",
  youtube: "bg-red-300 dark:bg-red-500/50",
  facebook: "bg-blue-300 dark:bg-blue-500/50",
  x: "bg-amber-300 dark:bg-amber-500/50",
  threads: "bg-green-300 dark:bg-green-500/50",
};

// ─── Wizard state ────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

type CampaignWizardState = {
  step: WizardStep;
  selectedBookId: string | null;
  channels: Set<ChannelId>;
  frequency: PostFrequency | null;
  startDate: string;
  template: ContentTemplate;
  schedule: Map<WeekDay, ChannelId[]>;
};

function createInitialState(bookId: string | null): CampaignWizardState {
  const today = new Date();
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  const dateStr = nextMonday.toISOString().slice(0, 10);

  return {
    step: 1,
    selectedBookId: bookId,
    channels: new Set(),
    frequency: null,
    startDate: dateStr,
    template: "launch",
    schedule: new Map(),
  };
}

function buildDefaultSchedule(
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
          Vilken bok vill du marknadsföra?
        </h3>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
          Välj boken som kampanjen ska handla om.
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
                  {book.title ?? "Namnlös bok"}
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

// ─── Step 2: Channels + frequency ────────────────────────────────────────────

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
              Var vill du publicera?
            </h3>
            <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/50">
              Du kan välja flera plattformar
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-slate-500 dark:text-white/50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              className="h-4 w-4 rounded border-black/20 text-[#907AFF] accent-[#907AFF] dark:border-white/20"
            />
            Välj alla
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
          Hur ofta vill du publicera per vecka?
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
  const formattedDate = startDateObj.toLocaleDateString("sv-SE", {
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
            Startdatum
          </h3>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
            Välj när ditt innehållsschema ska börja
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
            Välj en veckomall
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
            Veckoschema
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
                Alla
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

type CampaignWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: CampaignBook[];
  initialBookId?: string | null;
  onComplete?: (config: {
    bookId: string;
    channels: ChannelId[];
    frequency: PostFrequency;
    startDate: string;
    template: ContentTemplate;
    schedule: Record<string, string[]>;
  }) => void;
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
  const [state, setState] = useState<CampaignWizardState>(() =>
    createInitialState(initialBookId ?? books[0]?.id ?? null)
  );
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
        return state.channels.size > 0 && state.frequency !== null;
      case 3:
        return true;
      default:
        return false;
    }
  }, [state.step, state.selectedBookId, state.channels.size, state.frequency]);

  const goNext = useCallback(() => {
    setState((prev) => {
      if (prev.step === 2) {
        const schedule = buildDefaultSchedule(prev.channels, prev.frequency);
        return { ...prev, step: 3 as WizardStep, schedule };
      }
      if (prev.step < 3) {
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

  const close = useCallback(() => {
    setVisible(false);
    // Wait for exit animation before unmounting
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const handleComplete = useCallback(() => {
    if (!state.selectedBookId || !state.frequency) return;

    const scheduleObj: Record<string, string[]> = {};
    state.schedule.forEach((chs, day) => {
      scheduleObj[day] = chs;
    });

    onComplete?.({
      bookId: state.selectedBookId,
      channels: [...state.channels],
      frequency: state.frequency,
      startDate: state.startDate,
      template: state.template,
      schedule: scheduleObj,
    });

    close();
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

  const isLastStep = state.step === 3;

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
          Skapa kampanj
        </h2>

        {/* Progress */}
        <div className="mt-5">
          <WizardProgress step={state.step} totalSteps={3} />
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

          {state.step === 3 && (
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

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={state.step === 1 ? close : goBack}
            className={cn(
              "rounded-xl border px-6 py-2.5 text-[14px] font-medium transition-all",
              PRESSABLE,
              CARD_IDLE
            )}
          >
            {state.step === 1 ? "Avbryt" : "Tillbaka"}
          </button>
          <button
            type="button"
            onClick={isLastStep ? handleComplete : goNext}
            disabled={!canAdvance}
            className={cn(
              "rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE] disabled:opacity-50",
              PRESSABLE
            )}
          >
            {isLastStep ? "Skapa kampanj" : "Fortsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}
