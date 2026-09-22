/**
 * What to reserve before an agent run.
 *
 * A conservative bound in model token units, not a monetary quote — the same
 * contract as the other pipelines in lib/workers/budget.
 *
 * The thing that makes an agent run cost differently from a chat reply is that
 * the whole conversation is re-sent every turn. A search that pulls the matched
 * context of a book into the conversation once is then paid for again on every
 * later turn, so cost scales with turns × payload rather than with the number
 * of calls. That is the shape this estimate has to have, or a long manuscript
 * looks cheap right up until the bill.
 */

import { MAX_CHAPTER_CHARS, MAX_MATCHES_PER_SEARCH, MAX_TOOL_TURNS } from "./tools";

/** Swedish prose through a BPE tokenizer, rounded up rather than measured. */
const TOKENS_PER_CHAR = 0.35;
/** System prompt plus the tool schemas, re-sent on every turn. */
const TURN_FRAMING_TOKENS = 2_000;
/** Mirrors loop.ts; duplicated deliberately so a change there fails the test here. */
const MAX_TOKENS_PER_TURN = 4_000;
const MAX_RUN_INPUT_TOKENS = 150_000;
/** Roughly one match record: ids, chapter title and ±60 characters of context. */
const CHARS_PER_MATCH = 190;

/** The most the loop can spend before its own ceilings stop it. */
export const AGENT_RUN_CEILING_UNITS = MAX_RUN_INPUT_TOKENS + MAX_TOOL_TURNS * MAX_TOKENS_PER_TURN;

/**
 * `chapterChars` is the manuscript's size, which bounds what any tool can put
 * into the conversation. A short book reserves little; a long one is clipped to
 * what the loop would actually let itself spend.
 */
export function estimateAgentRunUnits(chapterChars: number): number {
  const reachable = Math.min(
    Math.max(chapterChars, 0),
    MAX_MATCHES_PER_SEARCH * CHARS_PER_MATCH + MAX_CHAPTER_CHARS,
  );
  const payload = reachable * TOKENS_PER_CHAR;
  const input = MAX_TOOL_TURNS * (TURN_FRAMING_TOKENS + payload);
  const output = MAX_TOOL_TURNS * MAX_TOKENS_PER_TURN;
  return Math.min(Math.ceil(input + output), AGENT_RUN_CEILING_UNITS);
}
