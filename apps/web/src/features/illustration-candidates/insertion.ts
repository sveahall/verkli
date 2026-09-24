import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { candidateSchema, intentSchema, scopeKeySchema, type CandidateScopeKey, type SavedCandidate } from "./contracts";
import { candidateImageReference } from "./media-reference";

export async function insertSavedCandidate(input: {
  scope: CandidateScopeKey;
  candidate: SavedCandidate;
  alt: string;
  getState: () => EditorState;
  dispatch: (transaction: Transaction) => void;
  isCurrent: () => boolean;
  verify: () => Promise<void>;
}): Promise<void> {
  const scope = scopeKeySchema.parse(input.scope);
  const candidate = candidateSchema.parse(input.candidate);
  if (candidate.imageUrl !== candidateImageReference(scope, candidate.id)) throw new Error("This illustration does not belong to the active chapter.");
  const alt = intentSchema.shape.alt.safeParse(input.alt);
  if (!alt.success) throw new Error("Add a description of 1–500 characters before inserting the illustration.");
  const assertCurrent = () => { if (!input.isCurrent()) throw new Error("Your account or chapter changed. Open the illustration again."); };
  assertCurrent();
  await input.verify();
  assertCurrent();
  // Read the current editor only after verification; typing during the request is preserved.
  const state = input.getState();
  const image = state.schema.nodes.image.create({ src: candidate.imageUrl, alt: alt.data });
  // Collapse a selection at its end so inserting a picture never replaces selected prose.
  const position = state.selection.to;
  const transaction = state.tr.insert(position, image);
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(transaction.mapping.map(position, 1)))).scrollIntoView();
  input.dispatch(closeHistory(transaction));
  // Keep subsequent typing out of this undo event as well as preceding unsaved prose.
  input.dispatch(closeHistory(input.getState().tr));
}
