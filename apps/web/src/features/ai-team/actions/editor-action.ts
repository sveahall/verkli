import type { EditorState, Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { agentActionSchema, extractAgentChapterText, type AgentAction } from "@/lib/ai/agent-actions";

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
  const matches: { from: number; to: number }[] = [];
  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    node.descendants((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) { text += child.text[i]; positions.push(position + 1 + offset + i); }
      } else if (child.isLeaf) { text += "\uFFFC"; positions.push(-1); }
    });
    for (let index = text.indexOf(action.original); index >= 0; index = text.indexOf(action.original, index + 1)) {
      const target = positions.slice(index, index + action.original.length);
      if (target.every((p, i) => p >= 0 && (i === 0 || p === target[i - 1] + 1))) {
        matches.push({ from: target[0], to: target[target.length - 1] + 1 });
      }
    }
    return false;
  });
  if (matches.length !== 1) throw new Error("The suggestion must match exactly one passage. Ask for a more specific correction.");
  const target = matches[0];
  // Keep unchanged prefix/suffix nodes intact, including emphasis and links.
  let prefix = 0;
  while (prefix < action.original.length && prefix < action.replacement.length && action.original[prefix] === action.replacement[prefix]) prefix++;
  let suffix = 0;
  while (suffix < action.original.length - prefix && suffix < action.replacement.length - prefix && action.original[action.original.length - 1 - suffix] === action.replacement[action.replacement.length - 1 - suffix]) suffix++;
  const from = target.from + prefix;
  const to = target.to - suffix;
  const replacement = action.replacement.slice(prefix, action.replacement.length - suffix);
  if (from === to && !replacement) throw new Error("This suggestion already matches the chapter.");
  const markSets = new Set<string>();
  state.doc.nodesBetween(from, to, (node) => { if (node.isText) markSets.add(JSON.stringify(node.marks.map((mark) => mark.toJSON()))); });
  if (markSets.size > 1) throw new Error("This rewrite crosses different formatting. Ask for a smaller correction to preserve your emphasis and styles.");
  // Ignore the user's current typing marks: this change belongs to the target.
  // At a prefix/suffix insertion boundary, use the inside of the quoted passage.
  const position = state.doc.resolve(from);
  if (from === to && from > target.from && from < target.to &&
      JSON.stringify(position.nodeBefore?.marks.map(mark => mark.toJSON()) ?? []) !== JSON.stringify(position.nodeAfter?.marks.map(mark => mark.toJSON()) ?? [])) {
    throw new Error("This insertion sits between different formatting. Ask for a smaller correction that quotes only the word to change.");
  }
  const marks = (from === target.to ? position.nodeBefore : position.nodeAfter)?.marks ?? [];
  const transaction = closeHistory(state.tr);
  if (replacement) transaction.replaceWith(from, to, state.schema.text(replacement, marks));
  else transaction.delete(from, to);
  return transaction.scrollIntoView();
}
