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
/**
 * System prompt plus the tool schemas, re-sent on every turn. Measured from the
 * source rather than guessed: TOOL_DEFINITIONS is ~8 300 characters and the
 * system prompt ~1 600, which is well past the 2 000 this used to assume.
 */
const TURN_FRAMING_TOKENS = 2_800;
/** Mirrors loop.ts; duplicated deliberately so a change there fails the test here. */
const MAX_TOKENS_PER_TURN = 4_000;
const MAX_RUN_INPUT_TOKENS = 150_000;
/**
 * One serialised match record: a uuid chapter id, the chapter title, the matched
 * text and ±60 characters of context. Measured at ~250–270 for ordinary
 * queries, not the 190 this first assumed.
 */
const CHARS_PER_MATCH = 270;

/**
 * The most a run can actually cost.
 *
 * Not `MAX_RUN_INPUT_TOKENS + output`, which is what this claimed and is wrong:
 * loop.ts adds a turn's input to the running total and only then compares it to
 * the ceiling, so the turn that crosses the line has already been billed in
 * full. Nothing bounds a single turn's input either. The real worst case is
 * therefore the ceiling plus one more whole turn, and a whole turn is itself
 * bounded by the conversation, which is bounded by the ceiling.
 */
export const AGENT_RUN_CEILING_UNITS = 2 * MAX_RUN_INPUT_TOKENS + MAX_TOOL_TURNS * MAX_TOKENS_PER_TURN;

/**
 * `chapterChars` is the manuscript's size, which bounds what any tool can put
 * into the conversation. A short book reserves little; a long one is clipped to
 * what the loop would actually let itself spend.
 */
/**
 * The OPENING reservation, not a bound on the run.
 *
 * A true bound is unusable as a gate: a search does not put the manuscript into
 * the conversation, it puts a record per match in, and a match can be one
 * character while its record is some 270 — so the honest worst case for any
 * book over a few hundred characters is the whole ceiling, and every author
 * would be allowed one run a day.
 *
 * What makes the ledger true is `reconcileAgentRunUnits` after the run, when
 * the real usage is known. This only has to be a reasonable opening position.
 */
export function estimateAgentRunUnits(chapterChars: number): number {
  const chars = Math.max(chapterChars, 0);
  const reachable = Math.min(chars, MAX_MATCHES_PER_SEARCH * CHARS_PER_MATCH + MAX_CHAPTER_CHARS);
  const payload = reachable * TOKENS_PER_CHAR;
  const input = MAX_TOOL_TURNS * (TURN_FRAMING_TOKENS + payload);
  const output = MAX_TOOL_TURNS * MAX_TOKENS_PER_TURN;
  return Math.min(Math.ceil(input + output), AGENT_RUN_CEILING_UNITS);
}

/**
 * What still has to be charged once the run is over.
 *
 * Returns 0 when the opening reservation already covered it. Over-reserving is
 * left alone deliberately: releasing the difference would need a second ledger
 * write to undo a charge that erring high already made safe, and the daily key
 * expires at midnight UTC regardless.
 */
export function reconcileAgentRunUnits(reserved: number, usage: { inputTokens: number; outputTokens: number }): number {
  const spent = Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens);
  return Math.max(0, Math.ceil(spent - reserved));
}
