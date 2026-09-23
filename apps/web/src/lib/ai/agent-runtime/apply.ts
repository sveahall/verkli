/**
 * Executing an approved plan.
 *
 * Two guards stand between a plan and the manuscript, and they answer different
 * questions:
 *
 *   - The chapter hash recorded when the plan was built answers "do the
 *     positions in this plan still point at the text they were measured from?"
 *     A chapter the author has typed in since is skipped, never re-searched:
 *     re-searching would quietly apply the plan to prose nobody approved.
 *   - The compare-and-swap on updated_at + version_number answers "did anything
 *     change between reading the chapter and writing it back?" — the same guard
 *     the editor's own autosave uses, so an agent write and a keystroke cannot
 *     overwrite each other.
 *
 * Cover artwork generation is deliberately absent. It already has a route with
 * its own budget ceiling and rate limit; running it from here would be a second
 * spend path for the same capability, so those steps come back for the client
 * to run through the existing one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { EditorState } from "@tiptap/pm/state";
import { findTextMatches } from "@/lib/tiptap-text-offsets";
import { replaceTextRanges, type TextEdit } from "@/lib/tiptap-replace";
import { chapterSchema } from "@/lib/tiptap-schema";
import {
  authorizeProductionEdition, loadProductionDraft, saveProductionDraft,
} from "@/lib/book-production/server";
import { createProductionSection, createProductionSettings, type ProductionSettings } from "@/features/book-production/model";
import type { AgentBook, AgentChapter } from "./book-context";
import type { Plan, PlanStep } from "./plan";

export type StepOutcome = {
  stepId: string;
  tool: PlanStep["tool"];
  status: "applied" | "skipped" | "deferred" | "failed";
  detail: string;
  /** Passages changed, for the steps that change passages. */
  changed?: number;
};

export type ApplySelection = {
  /** Steps the author kept. Undefined means all of them. */
  stepIds?: string[];
  /** Matches the author ticked, across every step. Undefined means the preselected ones. */
  matchIds?: string[];
};

type ChapterWork = { chapter: AgentChapter; edits: (TextEdit & { stepId: string })[] };

const STALE_CHAPTER = "You edited this chapter after the plan was made, so it was left untouched. Ask again for a fresh plan.";
/**
 * Losing the compare-and-swap and failing to reach the database are different
 * events, and collapsing them told the author they had edited a chapter they
 * had not touched. Neither client sets `throwOnError`, so a pooler timeout, a
 * statement timeout or a dropped connection arrives here as an ordinary
 * `error` — and the plan is spent either way, so the wrong explanation costs a
 * whole new run as well as the trust.
 */
const WRITE_UNAVAILABLE = "The database did not accept this chapter, so nothing in it was written. Nothing was lost — ask for a fresh plan and try again.";

function selectedSteps(plan: Plan, selection: ApplySelection): PlanStep[] {
  if (!selection.stepIds) return plan.steps;
  const keep = new Set(selection.stepIds);
  return plan.steps.filter((step) => keep.has(step.id));
}

/** Collects every chapter edit the approved steps ask for, keyed by chapter. */
function collectChapterWork(
  steps: PlanStep[], book: AgentBook, selection: ApplySelection,
): { work: Map<string, ChapterWork>; outcomes: StepOutcome[]; notes: Map<string, string> } {
  const ticked = selection.matchIds ? new Set(selection.matchIds) : null;
  const work = new Map<string, ChapterWork>();
  const outcomes: StepOutcome[] = [];
  const notes = new Map<string, string>();

  const workFor = (chapter: AgentChapter): ChapterWork => {
    const existing = work.get(chapter.id);
    if (existing) return existing;
    const created = { chapter, edits: [] };
    work.set(chapter.id, created);
    return created;
  };

  for (const step of steps) {
    if (step.tool === "replace_in_book") {
      const wanted = step.matches.filter((match) => (ticked ? ticked.has(match.matchId) : match.preselected));
      if (!wanted.length) {
        outcomes.push({ stepId: step.id, tool: step.tool, status: "skipped", detail: "No passages were ticked for this change.", changed: 0 });
        continue;
      }
      let stale = 0;
      for (const match of wanted) {
        const chapter = book.chapters.find((entry) => entry.id === match.chapterId);
        if (!chapter?.doc || chapter.hash !== match.chapterHash) {
          stale++;
          continue;
        }
        workFor(chapter).edits.push({
          stepId: step.id,
          target: { from: match.from, to: match.to },
          original: match.text,
          replacement: match.replacement,
        });
      }
      if (stale === wanted.length) {
        outcomes.push({ stepId: step.id, tool: step.tool, status: "skipped", detail: STALE_CHAPTER, changed: 0 });
      } else if (stale) {
        // Partial staleness used to pass silently, so an author who had typed
        // in one chapter was told the rename succeeded everywhere.
        notes.set(step.id, `${stale} ${stale === 1 ? "passage was" : "passages were"} in a chapter you have edited since, and ${stale === 1 ? "was" : "were"} left alone.`);
      }
      continue;
    }

    if (step.tool === "rewrite_passage") {
      const chapter = book.chapters.find((entry) => entry.id === step.chapterId);
      if (!chapter?.doc || chapter.hash !== step.chapterHash) {
        outcomes.push({ stepId: step.id, tool: step.tool, status: "skipped", detail: STALE_CHAPTER, changed: 0 });
        continue;
      }
      // The pin holds, so this re-find can only agree with the one made when the
      // step was recorded. It is here to produce the position, not to re-decide.
      const matches = findTextMatches(chapter.doc, step.original, { caseSensitive: true });
      if (matches.length !== 1) {
        outcomes.push({ stepId: step.id, tool: step.tool, status: "failed", detail: "That passage is no longer unique in the chapter.", changed: 0 });
        continue;
      }
      workFor(chapter).edits.push({
        stepId: step.id, target: matches[0], original: step.original, replacement: step.replacement,
      });
    }
  }

  return { work, outcomes, notes };
}

/** Two edits over the same characters would apply twice at positions that moved. */
function dropOverlaps(edits: (TextEdit & { stepId: string })[]): { kept: typeof edits; dropped: typeof edits } {
  const ordered = [...edits].sort((a, b) => a.target.from - b.target.from);
  const kept: typeof edits = [];
  const dropped: typeof edits = [];
  let boundary = -1;
  for (const edit of ordered) {
    if (edit.target.from < boundary) dropped.push(edit);
    else {
      kept.push(edit);
      boundary = edit.target.to;
    }
  }
  return { kept, dropped };
}

/**
 * Applies one chapter's edits and reports per step how many went in.
 *
 * Counting per step rather than per edit was a real misreport: a rename with
 * forty-six good matches and one landing on a formatting seam put the step id
 * in `failures`, and the whole step was then counted as zero. The author was
 * told nothing had changed about a chapter that had just been rewritten.
 */
async function applyChapter(
  supabase: SupabaseClient, bookId: string, { chapter, edits }: ChapterWork,
): Promise<{ applied: Map<string, number>; failures: Map<string, string> }> {
  const appliedByStep = new Map<string, number>();
  const failures = new Map<string, string>();
  const { kept, dropped } = dropOverlaps(edits);
  for (const edit of dropped) failures.set(edit.stepId, "Two changes covered the same words; the later one was left out.");

  const state = EditorState.create({ schema: chapterSchema, doc: chapter.doc! });
  const { transaction, applied, skipped } = replaceTextRanges(state, kept, { skipInvalid: true });
  const skippedEdits = new Set(skipped.map((entry) => entry.index));
  for (const entry of skipped) failures.set(kept[entry.index].stepId, entry.reason);
  if (!applied) return { applied: appliedByStep, failures };

  const serialized = JSON.stringify(state.apply(transaction).doc.toJSON());
  const { data, error } = await supabase
    .from("chapters")
    .update({ content: serialized })
    .eq("book_id", bookId)
    .eq("id", chapter.id)
    // Never filter on the content itself: a chapter does not belong in a URL.
    .eq("updated_at", chapter.updatedAt)
    .eq("version_number", chapter.versionNumber)
    .select("id");

  if (error) {
    console.error("[agent.apply] chapter write failed", { chapterId: chapter.id, code: error.code });
    for (const edit of kept) failures.set(edit.stepId, WRITE_UNAVAILABLE);
    return { applied: appliedByStep, failures };
  }
  if (!data?.some((row) => row.id === chapter.id)) {
    for (const edit of kept) failures.set(edit.stepId, STALE_CHAPTER);
    return { applied: appliedByStep, failures };
  }

  kept.forEach((edit, index) => {
    if (skippedEdits.has(index)) return;
    appliedByStep.set(edit.stepId, (appliedByStep.get(edit.stepId) ?? 0) + 1);
  });
  return { applied: appliedByStep, failures };
}

/** Everything stored in the edition's production settings: cover and front matter. */
async function applyEditionSteps(bookId: string, versionId: string, steps: PlanStep[], bookTitle: string): Promise<StepOutcome[]> {
  const relevant = steps.filter((step) =>
    step.tool === "set_cover_text" || step.tool === "set_cover_style" || step.tool === "add_front_matter_section");
  if (!relevant.length) return [];

  try {
    // Same authorisation, validation and revision check the cover panel saves
    // through — the agent gets no private write path.
    const context = await authorizeProductionEdition(bookId, versionId);
    const draft = await loadProductionDraft(context);
    const settings: ProductionSettings = draft.settings ?? createProductionSettings({ title: bookTitle });

    let next = settings;
    for (const step of relevant) {
      if (step.tool === "set_cover_text") {
        const { subtitle, backText, spineText } = step.fields;
        next = {
          ...next,
          ...(subtitle !== undefined ? { subtitle } : {}),
          cover: {
            ...next.cover,
            ...(backText !== undefined ? { backText } : {}),
            ...(spineText !== undefined ? { spineText } : {}),
          },
        };
      } else if (step.tool === "set_cover_style") {
        next = { ...next, cover: { ...next.cover, ...step.fields } };
      } else if (step.tool === "add_front_matter_section") {
        // Built from the same factory the panel uses, so placement, id and the
        // recto rule come from one definition rather than being guessed here.
        const section = { ...createProductionSection(step.kind), title: step.title, body: step.body };
        next = { ...next, sections: [...next.sections, section] };
      }
    }

    await saveProductionDraft(context, next, draft.revision);
    return relevant.map((step) => ({
      stepId: step.id, tool: step.tool, status: "applied" as const,
      detail: step.tool === "add_front_matter_section" ? "Added to your book's pages." : "Saved to your cover.",
    }));
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : "The cover could not be saved. Open Cover and try again.";
    return relevant.map((step) => ({ stepId: step.id, tool: step.tool, status: "failed" as const, detail }));
  }
}

export async function applyPlan(
  supabase: SupabaseClient,
  book: AgentBook,
  plan: Plan,
  selection: ApplySelection = {},
): Promise<StepOutcome[]> {
  const steps = selectedSteps(plan, selection);
  const { work, outcomes, notes } = collectChapterWork(steps, book, selection);

  const changedByStep = new Map<string, number>();
  const failedByStep = new Map<string, string>(notes);
  // A step's edits can span several chapters, and a chapter's edits can come
  // from several steps, so both maps accumulate across the whole plan.
  for (const entry of work.values()) {
    const { applied, failures } = await applyChapter(supabase, book.bookId, entry);
    for (const [stepId, reason] of failures) failedByStep.set(stepId, reason);
    for (const [stepId, count] of applied) changedByStep.set(stepId, (changedByStep.get(stepId) ?? 0) + count);
  }

  for (const step of steps) {
    if (step.tool !== "replace_in_book" && step.tool !== "rewrite_passage") continue;
    if (outcomes.some((outcome) => outcome.stepId === step.id)) continue;
    const changed = changedByStep.get(step.id) ?? 0;
    const failure = failedByStep.get(step.id);
    outcomes.push(
      changed
        // Partly applied is the common case, not an edge one: say both halves.
        ? { stepId: step.id, tool: step.tool, status: "applied", changed,
            detail: `${changed} ${changed === 1 ? "passage" : "passages"} changed.${failure ? ` ${failure}` : ""}` }
        : { stepId: step.id, tool: step.tool, status: failure ? "skipped" : "failed", detail: failure ?? "Nothing was changed.", changed: 0 },
    );
  }

  outcomes.push(...await applyEditionSteps(book.bookId, book.versionId, steps, book.bookTitle));

  for (const step of steps) {
    if (step.tool !== "set_book_description") continue;
    // The author's own client, so row-level security is the ownership check.
    const { data, error } = await supabase
      .from("books").update({ description: step.description }).eq("id", book.bookId).select("id");
    outcomes.push(error || !data?.length
      ? { stepId: step.id, tool: step.tool, status: "failed", detail: "The description could not be saved. Try again." }
      : { stepId: step.id, tool: step.tool, status: "applied", detail: "Saved to your book." });
  }

  for (const step of steps) {
    if (step.tool !== "generate_cover_image") continue;
    outcomes.push({
      stepId: step.id, tool: step.tool, status: "deferred",
      detail: "Cover options are generated from the Cover panel, which has its own spend limit.",
    });
  }

  return outcomes.sort((a, b) => steps.findIndex((s) => s.id === a.stepId) - steps.findIndex((s) => s.id === b.stepId));
}
