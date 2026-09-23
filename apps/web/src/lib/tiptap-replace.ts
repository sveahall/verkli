/**
 * Mark-preserving text replacement over known ranges.
 *
 * Lifted out of the agent's single-chapter edit so the same splice serves a
 * whole-book replace. The rules it enforces are the reason an agent edit has
 * never mangled a manuscript, and they are worth stating plainly:
 *
 *   - Only the characters that actually differ are touched. "Johan" → "Jonas"
 *     rewrites "han" → "nas" and leaves "Jo" alone, so a link or an italic that
 *     starts mid-word survives.
 *   - A replacement that spans two different formattings is refused rather than
 *     flattened. Losing an emphasis silently is worse than refusing the edit.
 *   - Edits are applied from the end of the document backwards, so positions
 *     taken from the original document stay valid for every later edit.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { TextMatch } from "./tiptap-text-offsets";

export type TextEdit = {
  target: TextMatch;
  /** The text as it currently reads. Used to keep the untouched prefix/suffix. */
  original: string;
  /** May be empty, which deletes the passage. */
  replacement: string;
};

export type SkippedEdit = { index: number; reason: string };

export type ReplaceResult = {
  transaction: Transaction;
  applied: number;
  skipped: SkippedEdit[];
};

function markSignature(marks: readonly { toJSON(): unknown }[] | undefined): string {
  return JSON.stringify((marks ?? []).map((mark) => mark.toJSON()));
}

/** The narrowed range and text, or a reason this edit cannot be applied. */
function planEdit(state: EditorState, edit: TextEdit):
  | { from: number; to: number; text: string; marks: readonly unknown[] }
  | { reason: string } {
  const { target, original, replacement } = edit;

  let prefix = 0;
  while (prefix < original.length && prefix < replacement.length && original[prefix] === replacement[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < replacement.length - prefix &&
    original[original.length - 1 - suffix] === replacement[replacement.length - 1 - suffix]
  ) suffix++;

  const from = target.from + prefix;
  const to = target.to - suffix;
  const text = replacement.slice(prefix, replacement.length - suffix);
  if (from === to && !text) return { reason: "This suggestion already matches the chapter." };

  const markSets = new Set<string>();
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) markSets.add(markSignature(node.marks));
  });
  if (markSets.size > 1) {
    return { reason: "This rewrite crosses different formatting. Ask for a smaller correction to preserve your emphasis and styles." };
  }

  const position = state.doc.resolve(from);
  // A pure insertion inside the quoted passage must not have to guess which
  // side's formatting it belongs to.
  if (
    from === to && from > target.from && from < target.to &&
    markSignature(position.nodeBefore?.marks) !== markSignature(position.nodeAfter?.marks)
  ) {
    return { reason: "This insertion sits between different formatting. Ask for a smaller correction that quotes only the word to change." };
  }

  // Ignore the user's current typing marks: this change belongs to the target.
  const adjacent = (from === target.to ? position.nodeBefore : position.nodeAfter)?.marks ?? [];
  // Except a link. Inheriting emphasis onto inserted text matches what an
  // author expects — "Johan" in bold becoming "unge Johan" in bold. A link is
  // different: its href belongs to the words that were linked, so extending
  // "Ulysses" to "Ulysses and Dubliners" would quietly point a second title at
  // the first one's URL. Purely added characters do not inherit it.
  const marks = from === to ? adjacent.filter((mark) => mark.type.name !== "link") : adjacent;
  return { from, to, text, marks };
}

/**
 * One transaction covering every edit.
 *
 * With `skipInvalid`, an edit that cannot be applied is reported instead of
 * aborting the rest — a whole-book replace should not lose forty-six good
 * corrections because one landed on a formatting seam.
 */
export function replaceTextRanges(
  state: EditorState,
  edits: TextEdit[],
  options: { skipInvalid?: boolean } = {},
): ReplaceResult {
  const ordered = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => b.edit.target.from - a.edit.target.from);

  const transaction = closeHistory(state.tr);
  const skipped: SkippedEdit[] = [];
  let applied = 0;

  for (const { edit, index } of ordered) {
    const planned = planEdit(state, edit);
    if ("reason" in planned) {
      if (!options.skipInvalid) throw new Error(planned.reason);
      skipped.push({ index, reason: planned.reason });
      continue;
    }
    if (planned.text) {
      transaction.replaceWith(
        planned.from,
        planned.to,
        state.schema.text(planned.text, planned.marks as Parameters<typeof state.schema.text>[1]),
      );
    } else {
      transaction.delete(planned.from, planned.to);
    }
    applied++;
  }

  return { transaction: transaction.scrollIntoView(), applied, skipped };
}
