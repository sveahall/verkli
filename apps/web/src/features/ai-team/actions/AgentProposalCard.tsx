"use client";

import type { AgentAction } from "@/lib/ai/agent-actions";
import { Check, ArrowUpRight, Loader2, Play } from "lucide-react";
import { buildPronunciationPreview } from "@/lib/ai/pronunciation-preview";
import styles from "../AgentConversation.module.css";

export type ProposalState = { pending?: boolean; message?: string; error?: string; audioUrl?: string };
const titles: Record<AgentAction["kind"], string> = {
  edit_text: "A change to consider", cover_brief: "Your next cover direction", pronunciation: "Let’s hear the difference",
  pricing_draft: "A price for your review", marketing_draft: "A draft to make yours",
};
const labels: Record<AgentAction["kind"], string> = {
  edit_text: "Apply to chapter", cover_brief: "Generate cover options", pronunciation: "Listen to corrected sample",
  pricing_draft: "Review in pricing", marketing_draft: "Copy draft",
};
export default function AgentProposalCard({ action, state, onExecute }: {
  action: AgentAction; state?: ProposalState; onExecute: () => void;
}) {
  let preview: string | null = null;
  if (action.kind === "pronunciation") {
    try { preview = buildPronunciationPreview({ word: action.word, spokenAs: action.spokenAs, sampleText: action.sampleText }); } catch { /* Invalid preview stays non-executable. */ }
  }
  const invalidPreview = action.kind === "pronunciation" && !preview;
  return <section className={styles.proposal} aria-label={titles[action.kind]}>
    <h4>{titles[action.kind]}</h4>
    {action.kind === "edit_text" && <div className={styles.comparison}>
      <div><span>Original</span><p>{action.original}</p></div>
      <div data-new="true"><span>Suggested</span><p>{action.replacement}</p></div>
    </div>}
    {action.kind === "cover_brief" && <><p className={styles.brief}>{action.prompt}</p><p className={styles.meta}>Style: {action.style}</p></>}
    {action.kind === "pronunciation" && <>
      <div className={styles.pronunciation}><span>{action.word}</span><ArrowUpRight size={16} aria-hidden /><span>{action.spokenAs}</span></div>
      <p className={styles.meta}>Spoken sample</p><p className={styles.brief}>{preview ?? "Ask for a shorter pronunciation sample."}</p>
    </>}
    {action.kind === "pricing_draft" && <p className={styles.price}>{action.amount.toFixed(2)} <span>{action.currency}</span></p>}
    {action.kind === "marketing_draft" && <><p className={styles.brief}>{action.copy}</p><p className={styles.meta}>{action.channel}</p></>}
    <p className={styles.reason}>{action.reason}</p>
    {state?.audioUrl && <audio controls src={state.audioUrl} aria-label="Corrected pronunciation sample" className={styles.audio} />}
    {state?.message ? <p role="status" className={styles.result}><Check size={15} aria-hidden />{state.message}</p> : <button
      type="button" className={styles.apply} onClick={onExecute} disabled={state?.pending || invalidPreview}
    >{state?.pending ? <Loader2 className={styles.spinner} size={15} aria-hidden /> : action.kind === "pronunciation" ? <Play size={15} aria-hidden /> : <ArrowUpRight size={15} aria-hidden />}
      {state?.pending ? "Working on it…" : labels[action.kind]}</button>}
    {state?.error && <p role="alert" className={styles.error}>{state.error}</p>}
    <p className={styles.footnote}>{action.kind === "edit_text" ? "Changes your draft. Undo is available in the editor."
      : action.kind === "cover_brief" ? "Uses cover generation. Your current cover stays until you choose a new one."
      : action.kind === "pronunciation" ? "Uses a short voice preview. Preview only; your manuscript and full audiobook stay unchanged."
      : action.kind === "pricing_draft" ? "Opens an editable draft. Save it in Pricing to change your price." : "Nothing is published or sent automatically."}</p>
  </section>;
}
