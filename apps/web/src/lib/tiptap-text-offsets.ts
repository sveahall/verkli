/**
 * Mapping between a chapter's plain text and its ProseMirror positions.
 *
 * This walk existed twice — once in EditorFindReplace for the author's own
 * find/replace, once inside the agent's edit transaction — with the same
 * subtle rules written out separately: a leaf node (hard break, inline image)
 * must not silently join two words, and a match whose characters are not
 * contiguous in the document cannot be replaced as one range. Two copies of a
 * rule like that is how the editor's find and the agent's edit end up
 * disagreeing about what "one match" means. One copy, one meaning.
 *
 * Everything here operates on a ProseMirror node, so the same functions serve
 * the live editor (`editor.state.doc`) and the server (`Node.fromJSON(
 * chapterSchema, storedJson)` — see `./tiptap-schema`).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** A replaceable range, in ProseMirror document positions. */
export type TextMatch = {
  from: number;
  to: number;
  /** Up to `contextChars` of surrounding text, when requested. */
  before?: string;
  after?: string;
};

export type TextBlock = {
  /** The block's plain text, with one placeholder character per leaf node. */
  text: string;
  /** Document position of each character in `text`; -1 for a leaf placeholder. */
  positions: number[];
};

export type MatchOptions = {
  caseSensitive?: boolean;
  /** Require a non-word character (or a block edge) on both sides. */
  wholeWord?: boolean;
  /** Stop after this many matches. */
  limit?: number;
  /** When > 0, populate `before`/`after` with this much surrounding text. */
  contextChars?: number;
};

/**
 * U+FFFC OBJECT REPLACEMENT CHARACTER stands in for a leaf node, so "Fär" +
 * hardBreak + "jan" does not read as the word "Färjan".
 */
const LEAF_PLACEHOLDER = "￼";

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

function isWordBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHARACTER.test(text[index]);
}

/** Every text block in the document, with its plain text and positions. */
export function mapTextBlocks(doc: ProseMirrorNode): TextBlock[] {
  const blocks: TextBlock[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    block.descendants((node, offset) => {
      if (node.isText && node.text) {
        for (let index = 0; index < node.text.length; index++) {
          text += node.text[index];
          positions.push(blockPos + 1 + offset + index);
        }
      } else if (node.isLeaf) {
        text += LEAF_PLACEHOLDER;
        positions.push(-1);
      }
    });
    blocks.push({ text, positions });
    // A text block's children are inline; nothing below it is another block.
    return false;
  });
  return blocks;
}

function escapeLiteral(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every occurrence of `query`, as ranges that can be replaced directly.
 *
 * Matches are literal, never interpreted as a pattern. A match is skipped when
 * its characters are not contiguous document positions, which is what excludes
 * anything spanning a hard break or an inline image.
 */
export function findTextMatches(
  doc: ProseMirrorNode,
  query: string,
  options: MatchOptions = {},
): TextMatch[] {
  if (!query) return [];
  const { caseSensitive = false, wholeWord = false, limit, contextChars = 0 } = options;
  const pattern = new RegExp(escapeLiteral(query), caseSensitive ? "g" : "gi");
  const matches: TextMatch[] = [];

  for (const block of mapTextBlocks(doc)) {
    pattern.lastIndex = 0;
    let found: RegExpExecArray | null;
    while ((found = pattern.exec(block.text)) !== null) {
      const start = found.index;
      const end = start + found[0].length;
      // An empty match never advances lastIndex; step past it or loop forever.
      if (end === start) {
        pattern.lastIndex += 1;
        continue;
      }
      if (wholeWord && !(isWordBoundary(block.text, start - 1) && isWordBoundary(block.text, end))) {
        continue;
      }
      const span = block.positions.slice(start, end);
      const contiguous = span.every(
        (position, index) => position >= 0 && (index === 0 || position === span[index - 1] + 1),
      );
      if (!contiguous) continue;

      const match: TextMatch = { from: span[0], to: span[span.length - 1] + 1 };
      if (contextChars > 0) {
        match.before = block.text.slice(Math.max(0, start - contextChars), start);
        match.after = block.text.slice(end, end + contextChars);
      }
      matches.push(match);
      if (limit !== undefined && matches.length >= limit) return matches;
    }
  }

  return matches;
}
