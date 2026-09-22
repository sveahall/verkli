import type { EditorState, Transaction } from "@tiptap/pm/state";
import { agentActionSchema, extractAgentChapterText, type AgentAction } from "@/lib/ai/agent-actions";
import { findTextMatches } from "@/lib/tiptap-text-offsets";
import { replaceTextRanges } from "@/lib/tiptap-replace";

export type ProposalContext = { chapterId: string | null; chapterText: string | null };
export type ActionResult = { message: string };
export type ExecuteAgentAction = (action: AgentAction, context: ProposalContext) => Promise<ActionResult>;

/** Exact, single-block text edits only. Never parse model output as HTML. */
export function createAgentEditTransaction(
  state: EditorState,
  chapterId: string | null,
  context: ProposalContext,
  proposal: Extract<AgentAction, { kind: "edit_text" }>,
): Transaction {
  const action = agentActionSchema.parse(proposal);
  if (action.kind !== "edit_text") throw new Error("This is not a text correction.");
  if (!chapterId || chapterId !== context.chapterId) throw new Error("Open the same chapter before using this suggestion.");
  const current = extractAgentChapterText(state.doc.toJSON());
  if (current !== context.chapterText) throw new Error("This chapter has changed. Ask for an updated suggestion before applying it.");
  if (/[\r\n]/.test(action.original) || /[\r\n]/.test(action.replacement)) {
    throw new Error("Ask for a correction within a single paragraph so the chapter structure stays intact.");
  }
  // Shared with the editor's own find/replace (lib/tiptap-text-offsets): one
  // definition of what counts as a single, contiguous, replaceable match.
  const matches = findTextMatches(state.doc, action.original, { caseSensitive: true });
  if (matches.length !== 1) throw new Error("The suggestion must match exactly one passage. Ask for a more specific correction.");
  // The splice itself lives in lib/tiptap-replace, shared with the whole-book
  // replace so both preserve marks by the same rules.
  return replaceTextRanges(state, [
    { target: matches[0], original: action.original, replacement: action.replacement },
  ]).transaction;
}
