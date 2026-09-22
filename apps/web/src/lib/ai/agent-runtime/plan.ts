/**
 * Turning the model's write-tool calls into a plan the author can read.
 *
 * A write tool is never executed when the model calls it. It is validated here,
 * recorded as a step, and acknowledged — so the model can keep planning on top
 * of it — while the manuscript stays untouched until the author approves.
 *
 * Validating at record time rather than at apply time is what makes the loop
 * useful: a rewrite whose quoted passage does not exist comes back as an error
 * the model can correct in its next turn, instead of as a broken step the
 * author is asked to approve.
 */

import { z } from "zod";
import { findTextMatches } from "@/lib/tiptap-text-offsets";
import type { AgentBook } from "./book-context";
import type { MatchRegistry } from "./read-tools";
import { transferCasing } from "./casing";
import { MAX_PLAN_STEPS, MAX_REPLACEMENTS_PER_RUN, toolInputSchemas, type ToolName } from "./tools";

export const plannedMatchSchema = z.object({
  matchId: z.string(),
  chapterId: z.string().uuid(),
  chapterTitle: z.string(),
  chapterHash: z.string(),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
  text: z.string(),
  before: z.string(),
  after: z.string(),
  /** Already case-adjusted, so what the author reads is what gets written. */
  replacement: z.string(),
  /** Ticked in the plan. False means the author has to opt in. */
  preselected: z.boolean(),
});
export type PlannedMatch = z.infer<typeof plannedMatchSchema>;

export const planStepSchema = z.discriminatedUnion("tool", [
  z.object({
    id: z.string(), tool: z.literal("replace_in_book"), reason: z.string(),
    replacement: z.string(), matches: z.array(plannedMatchSchema).min(1),
    /** The search this was built from hit its cap, so the book holds more. */
    searchTruncated: z.boolean().optional(),
  }),
  z.object({
    id: z.string(), tool: z.literal("rewrite_passage"), reason: z.string(),
    chapterId: z.string().uuid(), chapterTitle: z.string(), chapterHash: z.string(),
    original: z.string(), replacement: z.string(),
  }),
  z.object({
    id: z.string(), tool: z.literal("set_cover_text"), reason: z.string(),
    fields: z.object({ subtitle: z.string().optional(), backText: z.string().optional(), spineText: z.string().optional() }),
  }),
  z.object({
    id: z.string(), tool: z.literal("set_cover_style"), reason: z.string(),
    fields: z.object({
      background: z.string().optional(), textColor: z.string().optional(),
      printTitle: z.boolean().optional(), reserveBarcode: z.boolean().optional(),
    }),
  }),
  z.object({
    id: z.string(), tool: z.literal("set_book_description"), reason: z.string(),
    description: z.string(),
  }),
  z.object({
    id: z.string(), tool: z.literal("add_front_matter_section"), reason: z.string(),
    kind: z.enum(["dedication", "foreword", "preface", "acknowledgements", "afterword", "bibliography", "about-author", "custom"]),
    title: z.string(), body: z.string(),
  }),
  z.object({
    id: z.string(), tool: z.literal("generate_cover_image"), reason: z.string(),
    prompt: z.string(), style: z.enum(["minimal", "photographic", "illustrated", "vintage"]),
  }),
]);
export type PlanStep = z.infer<typeof planStepSchema>;

export const planSchema = z.object({
  versionId: z.string().uuid(),
  steps: z.array(planStepSchema).max(MAX_PLAN_STEPS),
});
export type Plan = z.infer<typeof planSchema>;

/** A write tool call that could not be recorded. The model is told, and retries. */
export class PlanRejection extends Error {}

export class PlanBuilder {
  private readonly steps: PlanStep[] = [];
  private replacements = 0;

  constructor(private readonly book: AgentBook, private readonly registry: MatchRegistry) {}

  get length(): number {
    return this.steps.length;
  }

  build(): Plan {
    return { versionId: this.book.versionId, steps: [...this.steps] };
  }

  /**
   * Records one write-tool call. Returns what the model is told; throws
   * PlanRejection when the call cannot become a step.
   */
  record(tool: ToolName, rawInput: unknown): string {
    if (this.steps.length >= MAX_PLAN_STEPS) {
      throw new PlanRejection(`This plan already has ${MAX_PLAN_STEPS} steps, which is the most an author is asked to review at once. Finish and explain what is left.`);
    }
    const id = `s${this.steps.length + 1}`;

    switch (tool) {
      case "replace_in_book": return this.recordReplace(id, rawInput);
      case "rewrite_passage": return this.recordRewrite(id, rawInput);
      case "set_cover_text": {
        const { reason, ...fields } = toolInputSchemas.set_cover_text.parse(rawInput);
        this.steps.push({ id, tool, reason, fields });
        return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
      }
      case "set_cover_style": {
        const { reason, ...fields } = toolInputSchemas.set_cover_style.parse(rawInput);
        this.steps.push({ id, tool, reason, fields });
        return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
      }
      case "set_book_description": {
        const input = toolInputSchemas.set_book_description.parse(rawInput);
        this.steps.push({ id, tool, reason: input.reason, description: input.description });
        return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
      }
      case "add_front_matter_section": {
        const input = toolInputSchemas.add_front_matter_section.parse(rawInput);
        this.steps.push({ id, tool, reason: input.reason, kind: input.kind, title: input.title, body: input.body });
        return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
      }
      case "generate_cover_image": {
        const input = toolInputSchemas.generate_cover_image.parse(rawInput);
        this.steps.push({ id, tool, reason: input.reason, prompt: input.prompt, style: input.style });
        return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
      }
      default:
        throw new PlanRejection(`${tool} is not a write tool.`);
    }
  }

  private recordReplace(id: string, rawInput: unknown): string {
    const input = toolInputSchemas.replace_in_book.parse(rawInput);
    const chapterTitles = new Map(this.book.chapters.map((chapter) => [chapter.id, chapter.title]));

    const resolve = (matchId: string, preselected: boolean): PlannedMatch => {
      const match = this.registry.get(matchId);
      if (!match) throw new PlanRejection(`${matchId} is not a match from this conversation. Only use ids that search_book returned.`);
      return {
        matchId: match.id,
        chapterId: match.chapterId,
        chapterTitle: chapterTitles.get(match.chapterId) ?? "Untitled chapter",
        chapterHash: match.chapterHash,
        from: match.from,
        to: match.to,
        text: match.text,
        before: match.before,
        after: match.after,
        replacement: transferCasing(match.text, input.replacement),
        preselected,
      };
    };

    const seen = new Set<string>();
    const matches: PlannedMatch[] = [];
    for (const [ids, preselected] of [[input.matchIds, true], [input.optionalMatchIds ?? [], false]] as const) {
      for (const matchId of ids) {
        // The same match offered twice would be applied twice, at positions
        // that no longer mean what they did after the first pass.
        if (seen.has(matchId)) throw new PlanRejection(`${matchId} appears more than once. List every match exactly once.`);
        seen.add(matchId);
        matches.push(resolve(matchId, preselected));
      }
    }

    this.replacements += matches.length;
    if (this.replacements > MAX_REPLACEMENTS_PER_RUN) {
      throw new PlanRejection(`A single plan may change at most ${MAX_REPLACEMENTS_PER_RUN} passages. Narrow the search.`);
    }

    this.steps.push({
      id, tool: "replace_in_book", reason: input.reason, replacement: input.replacement, matches,
      ...(this.registry.truncated ? { searchTruncated: true } : {}),
    });
    return JSON.stringify({
      recorded: true,
      stepId: id,
      awaitingApproval: true,
      willApply: matches.filter((match) => match.preselected).length,
      offeredForReview: matches.filter((match) => !match.preselected).length,
    });
  }

  private recordRewrite(id: string, rawInput: unknown): string {
    const input = toolInputSchemas.rewrite_passage.parse(rawInput);
    const chapter = this.book.chapters.find((entry) => entry.id === input.chapterId);
    if (!chapter) throw new PlanRejection("No chapter with that id in this edition. Call list_chapters first.");
    if (!chapter.doc) throw new PlanRejection(chapter.unreadable ?? "That chapter could not be read.");
    if (/[\r\n]/.test(input.original) || /[\r\n]/.test(input.replacement)) {
      throw new PlanRejection("Quote a passage within a single paragraph so the chapter structure stays intact.");
    }

    // Checked now so the model can requote in its next turn, rather than the
    // author being shown a step that cannot run.
    const matches = findTextMatches(chapter.doc, input.original, { caseSensitive: true });
    if (matches.length === 0) throw new PlanRejection("That passage does not appear in this chapter. Read the chapter and quote it exactly.");
    if (matches.length > 1) throw new PlanRejection(`That passage appears ${matches.length} times in this chapter. Quote more of the surrounding sentence so it is unique.`);

    this.steps.push({
      id, tool: "rewrite_passage", reason: input.reason,
      chapterId: chapter.id, chapterTitle: chapter.title, chapterHash: chapter.hash,
      original: input.original, replacement: input.replacement,
    });
    return JSON.stringify({ recorded: true, stepId: id, awaitingApproval: true });
  }
}

/** What the author's plan card shows above the per-step detail. */
export function summarisePlan(plan: Plan): {
  steps: number;
  replacements: number;
  optional: number;
  truncated: boolean;
  chapters: { chapterId: string; chapterTitle: string; count: number }[];
} {
  const chapters = new Map<string, { chapterId: string; chapterTitle: string; count: number }>();
  let replacements = 0;
  let optional = 0;

  for (const step of plan.steps) {
    const touched: { chapterId: string; chapterTitle: string }[] = [];
    if (step.tool === "replace_in_book") {
      for (const match of step.matches) {
        if (match.preselected) replacements++;
        else optional++;
        touched.push(match);
      }
    } else if (step.tool === "rewrite_passage") {
      replacements++;
      touched.push(step);
    }
    for (const { chapterId, chapterTitle } of touched) {
      const entry = chapters.get(chapterId) ?? { chapterId, chapterTitle, count: 0 };
      entry.count++;
      chapters.set(chapterId, entry);
    }
  }

  return {
    steps: plan.steps.length,
    replacements,
    optional,
    truncated: plan.steps.some((step) => step.tool === "replace_in_book" && step.searchTruncated === true),
    chapters: [...chapters.values()],
  };
}
