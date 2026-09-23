"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Play } from "lucide-react";
import type { Plan, PlanStep, PlannedMatch, summarisePlan } from "@/lib/ai/agent-runtime/plan";
import styles from "../AgentConversation.module.css";

export type PlanOutcome = { stepId: string; status: string; detail: string; changed?: number };
export type PlanState = {
  pending?: boolean;
  outcomes?: PlanOutcome[];
  changed?: number;
  error?: string;
  /** The server already wrote this plan. Run must not be offered again. */
  alreadyApplied?: boolean;
};
export type PlanStats = ReturnType<typeof summarisePlan>;

const COVER_FIELD_LABELS: Record<string, string> = {
  subtitle: "Subtitle", backText: "Back-cover copy", spineText: "Spine text",
  background: "Cover colour", textColor: "Type colour",
  printTitle: "Title and author on the front", reserveBarcode: "Barcode area on the back",
};

function MatchRow({ match, ticked, onToggle }: { match: PlannedMatch; ticked: boolean; onToggle: () => void }) {
  return (
    <label className={styles.planMatch}>
      <input type="checkbox" checked={ticked} onChange={onToggle} />
      <span className={styles.planContext}>
        {match.before}
        <del>{match.text}</del>
        <ins>{match.replacement}</ins>
        {match.after}
      </span>
    </label>
  );
}

function ReplaceStep({ step, ticked, onToggle }: {
  step: Extract<PlanStep, { tool: "replace_in_book" }>;
  ticked: Set<string>;
  onToggle: (matchId: string) => void;
}) {
  const byChapter = useMemo(() => {
    const groups = new Map<string, { title: string; matches: PlannedMatch[] }>();
    for (const match of step.matches) {
      const group = groups.get(match.chapterId) ?? { title: match.chapterTitle, matches: [] };
      group.matches.push(match);
      groups.set(match.chapterId, group);
    }
    return [...groups.entries()];
  }, [step.matches]);

  return (
    <>
      <p className={styles.reason}>{step.reason}</p>
      {byChapter.map(([chapterId, group]) => (
        // Open by default only while the list is short enough to take in at a
        // glance; a rename across a whole book is a summary first, detail second.
        <details key={chapterId} className={styles.planChapter} open={step.matches.length <= 8}>
          <summary>
            {group.title}
            <span>{group.matches.length} {group.matches.length === 1 ? "change" : "changes"}</span>
          </summary>
          {group.matches.map((match) => (
            <MatchRow key={match.matchId} match={match} ticked={ticked.has(match.matchId)} onToggle={() => onToggle(match.matchId)} />
          ))}
        </details>
      ))}
      {step.matches.some((match) => !match.preselected) && (
        <p className={styles.meta}>Unticked changes are ones {"I"}&rsquo;m not sure about — read them before ticking.</p>
      )}
    </>
  );
}

function StepBody({ step, ticked, onToggle }: {
  step: PlanStep;
  ticked: Set<string>;
  onToggle: (matchId: string) => void;
}) {
  if (step.tool === "replace_in_book") return <ReplaceStep step={step} ticked={ticked} onToggle={onToggle} />;
  if (step.tool === "rewrite_passage") {
    return (
      <>
        <p className={styles.meta}>{step.chapterTitle}</p>
        <div className={styles.comparison}>
          <div><span>Now</span><p>{step.original}</p></div>
          <div data-new="true"><span>After</span><p>{step.replacement}</p></div>
        </div>
        <p className={styles.reason}>{step.reason}</p>
      </>
    );
  }
  if (step.tool === "generate_cover_image") {
    return (
      <>
        <p className={styles.brief}>{step.prompt}</p>
        <p className={styles.meta}>Style: {step.style}</p>
        <p className={styles.reason}>{step.reason}</p>
      </>
    );
  }
  return (
    <>
      <div className={styles.comparison}>
        {Object.entries(step.fields).map(([field, value]) => (
          <div key={field} data-new="true">
            <span>{COVER_FIELD_LABELS[field] ?? field}</span>
            <p>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</p>
          </div>
        ))}
      </div>
      <p className={styles.reason}>{step.reason}</p>
    </>
  );
}

/** The matches ticked when the plan first appears: the agent's confident ones. */
export function initialTicked(plan: Plan): Set<string> {
  return new Set(plan.steps.flatMap((step) => step.tool === "replace_in_book"
    ? step.matches.filter((match) => match.preselected).map((match) => match.matchId)
    : []));
}

/**
 * What gets sent for approval. A replacement step with nothing ticked drops out
 * entirely rather than being sent as an empty instruction.
 */
export function planSelection(plan: Plan, ticked: Set<string>, dropped: Set<string>): { stepIds: string[]; matchIds: string[] } {
  const steps = plan.steps.filter((step) => {
    if (dropped.has(step.id)) return false;
    if (step.tool !== "replace_in_book") return true;
    return step.matches.some((match) => ticked.has(match.matchId));
  });
  return { stepIds: steps.map((step) => step.id), matchIds: [...ticked] };
}

export default function AgentPlanCard({ plan, stats, state, onApply, onDismiss }: {
  plan: Plan;
  stats: PlanStats;
  state?: PlanState;
  onApply: (selection: { stepIds: string[]; matchIds: string[] }) => void;
  onDismiss: () => void;
}) {
  const [ticked, setTicked] = useState(() => initialTicked(plan));
  const [dropped, setDropped] = useState(() => new Set<string>());

  const toggle = (matchId: string) => setTicked((previous) => {
    const next = new Set(previous);
    if (!next.delete(matchId)) next.add(matchId);
    return next;
  });

  const selection = planSelection(plan, ticked, dropped);
  const keptSteps = plan.steps.filter((step) => selection.stepIds.includes(step.id));
  const passages = keptSteps.reduce((total, step) => total + (
    step.tool === "replace_in_book" ? step.matches.filter((match) => ticked.has(match.matchId)).length
      : step.tool === "rewrite_passage" ? 1 : 0
  ), 0);
  const otherSteps = keptSteps.filter((step) => step.tool !== "replace_in_book" && step.tool !== "rewrite_passage").length;

  const heading = passages
    ? `${passages} ${passages === 1 ? "change" : "changes"} in ${stats.chapters.length} ${stats.chapters.length === 1 ? "chapter" : "chapters"}`
    : otherSteps ? `${otherSteps} ${otherSteps === 1 ? "change" : "changes"} to your cover` : "Nothing selected";

  if (state?.outcomes) {
    return (
      <section className={styles.proposal} aria-label="What was changed">
        <h4>{state.changed ? `${state.changed} ${state.changed === 1 ? "passage" : "passages"} changed` : "Nothing was changed"}</h4>
        {state.outcomes.map((outcome) => (
          <p key={outcome.stepId} className={outcome.status === "applied" ? styles.result : styles.meta}>
            {outcome.status === "applied" && <Check size={15} aria-hidden />}{outcome.detail}
          </p>
        ))}
        <p className={styles.footnote}>Open the chapter to read the result. Undo works there as usual.</p>
      </section>
    );
  }

  if (state?.alreadyApplied) {
    return (
      <section className={styles.proposal} aria-label="What was changed">
        <h4>This plan was already applied</h4>
        <p className={styles.footnote}>Open the chapter to read the result. Undo works there as usual.</p>
      </section>
    );
  }

  return (
    <section className={styles.proposal} aria-label="Plan awaiting your approval">
      <h4>{heading}</h4>
      {plan.steps.map((step) => (
        <div key={step.id} className={styles.planStep} data-dropped={dropped.has(step.id) || undefined}>
          {plan.steps.length > 1 && (
            <label className={styles.planStepToggle}>
              <input
                type="checkbox"
                checked={!dropped.has(step.id)}
                onChange={() => setDropped((previous) => {
                  const next = new Set(previous);
                  if (!next.delete(step.id)) next.add(step.id);
                  return next;
                })}
              />
              <span>Include this change</span>
            </label>
          )}
          <StepBody step={step} ticked={ticked} onToggle={toggle} />
        </div>
      ))}
      <div className={styles.planActions}>
        <button type="button" className={styles.apply} disabled={state?.pending || !keptSteps.length} onClick={() => onApply(selection)}>
          {state?.pending ? <Loader2 className={styles.spinner} size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {state?.pending ? "Working on it…" : `Run ${passages + otherSteps}`}
        </button>
        <button type="button" className={styles.planDismiss} disabled={state?.pending} onClick={onDismiss}>No, leave it</button>
      </div>
      {state?.error && <p role="alert" className={styles.error}>{state.error}</p>}
      <p className={styles.footnote}>Nothing has changed yet. Your book is written only when you press Run.</p>
    </section>
  );
}
