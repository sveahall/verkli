import { z } from "zod";

export const AD_DRAFT_KIND = "ad_draft";
export const AD_DRAFT_FILTER = JSON.stringify({ kind: AD_DRAFT_KIND });
/** All versions stay out of generation, including malformed/unknown versions. */
export function isAdDraftConfig(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && "kind" in value && value.kind === AD_DRAFT_KIND;
}
const SCALE = 1_000_000n;
function units(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}
function decimal(value: bigint): string {
  const fraction = (value % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${value / SCALE}${fraction ? `.${fraction}` : ""}`;
}
const money = z.string().trim().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/, "Enter a plain amount with at most 9 whole digits and 6 decimals.")
  .refine(value => /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value) && units(value) > 0n, "Budget must be greater than zero.");
function calendarDate(value: string): number {
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN;
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(calendarDate(value)), "Enter a valid calendar date.");
export const adDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.string().trim().min(1).max(80),
  objective: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(500),
  headline: z.string().trim().min(1).max(180),
  copy: z.string().trim().min(1).max(5000),
  destinationUrl: z.string().trim().max(2000).url().refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  }, "Use an HTTPS link without embedded credentials."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Enter your three-letter planning currency."),
  totalBudget: money,
  dailyBudget: money.nullable(),
  startDate: date,
  endDate: date,
}).strict().superRefine((draft, context) => {
  const days = (calendarDate(draft.endDate) - calendarDate(draft.startDate)) / 86_400_000 + 1;
  if (!Number.isFinite(days) || days < 1 || days > 182) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Choose an end date on or after the start, within 182 calendar days." });
});
export type AdDraft = z.infer<typeof adDraftSchema>;
export type SavedAdDraft = { id: string; bookId: string; updatedAt: string; draft: AdDraft };
export const savedAdDraftSchema = z.object({ id: z.string().uuid(), bookId: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }), draft: adDraftSchema });
export function calculateAdBudget(input: AdDraft) {
  const draft = adDraftSchema.parse(input);
  const days = (calendarDate(draft.endDate) - calendarDate(draft.startDate)) / 86_400_000 + 1;
  const total = units(draft.totalBudget);
  const daily = draft.dailyBudget ? units(draft.dailyBudget) : null;
  const planned = daily === null ? total : daily * BigInt(days);
  return { days, totalBudget: decimal(total), dailyBudget: daily === null ? null : decimal(daily), maximumSpend: decimal(planned < total ? planned : total), limitedByTotal: planned > total };
}
export function adDraftConfig(draft: AdDraft) {
  return { kind: AD_DRAFT_KIND, version: 1, draft: adDraftSchema.parse(draft) };
}
export function readAdDraftConfig(value: unknown): AdDraft | null {
  const parsed = z.object({ kind: z.literal(AD_DRAFT_KIND), version: z.literal(1), draft: adDraftSchema }).strict().safeParse(value);
  return parsed.success ? parsed.data.draft : null;
}
