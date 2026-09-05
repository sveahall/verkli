"use client";

import { useState, useCallback } from "react";
import {
  RIGHTS_WORDING,
  PRIOR_PUBLICATION_DETAIL_MAX,
} from "@/lib/imports/attestation";

/**
 * The rights attestation an author gives before uploading a manuscript.
 *
 * One component for both upload surfaces, and the wording comes from the same
 * module the server parses against. That is deliberate: if the field names or
 * the sentences lived in two places they would drift, and a drifted warranty is
 * the failure this whole feature exists to prevent. It is also exactly what went
 * wrong in the middleware locks earlier today — two copies of one allowlist, one
 * of which never learned about a path.
 *
 * The UI is a convenience, not the gate. The server refuses independently
 * (`enforceRightsAttestation`), because `required` on an input stops an honest
 * user and nobody else.
 */

export interface RightsAttestationState {
  holdsRights: boolean;
  isOwnWork: boolean;
  consequences: boolean;
  previouslyPublished: "" | "yes" | "no";
  priorPublicationDetail: string;
}

export const EMPTY_ATTESTATION: RightsAttestationState = {
  holdsRights: false,
  isOwnWork: false,
  consequences: false,
  previouslyPublished: "",
  priorPublicationDetail: "",
};

/** True when every question is answered and the disclosure is complete. */
export function isAttestationComplete(state: RightsAttestationState): boolean {
  if (!state.holdsRights || !state.isOwnWork || !state.consequences) return false;
  if (state.previouslyPublished === "") return false;
  if (state.previouslyPublished === "yes" && state.priorPublicationDetail.trim() === "") {
    return false;
  }
  return state.priorPublicationDetail.length <= PRIOR_PUBLICATION_DETAIL_MAX;
}

/**
 * Append the attestation to an import request.
 *
 * The literal "true" matters. An `<input type="checkbox">` submits "on" by
 * default, and the server accepts nothing but "true" — so this function, not the
 * markup, is what makes the values match.
 */
export function appendAttestation(
  form: FormData,
  state: RightsAttestationState
): void {
  form.set("attestHoldsRights", state.holdsRights ? "true" : "false");
  form.set("attestIsOwnWork", state.isOwnWork ? "true" : "false");
  form.set("attestConsequences", state.consequences ? "true" : "false");
  form.set("attestPreviouslyPublished", state.previouslyPublished);
  if (state.previouslyPublished === "yes") {
    form.set("attestPriorPublicationDetail", state.priorPublicationDetail.trim());
  }
}

export function useRightsAttestation() {
  const [state, setState] = useState<RightsAttestationState>(EMPTY_ATTESTATION);
  const reset = useCallback(() => setState(EMPTY_ATTESTATION), []);
  return { state, setState, reset, complete: isAttestationComplete(state) };
}

type Props = {
  state: RightsAttestationState;
  onChange: (next: RightsAttestationState) => void;
  disabled?: boolean;
};

const checkboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--brand-violet)] " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--brand-violet)]/40 " +
  "dark:border-white/20 dark:bg-white/[0.05]";

// min-h-11 on the label, not the 16px box: the whole row is the tap target, so
// the 44px minimum is met without a checkbox the size of a postage stamp.
const rowClass =
  "flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-relaxed " +
  "text-slate-700 dark:text-white/80";

export default function RightsAttestationFields({ state, onChange, disabled }: Props) {
  const set = (patch: Partial<RightsAttestationState>) => onChange({ ...state, ...patch });

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
        Rights
      </legend>

      <label className={rowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={state.holdsRights}
          onChange={(e) => set({ holdsRights: e.target.checked })}
        />
        <span>{RIGHTS_WORDING.holdsRights}</span>
      </label>

      <label className={rowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={state.isOwnWork}
          onChange={(e) => set({ isOwnWork: e.target.checked })}
        />
        <span>{RIGHTS_WORDING.isOwnWork}</span>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-700 dark:text-white/80">
          {RIGHTS_WORDING.previouslyPublished}
        </span>
        <div className="flex gap-4">
          {(["no", "yes"] as const).map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="previouslyPublished"
                className={checkboxClass}
                checked={state.previouslyPublished === value}
                onChange={() => set({ previouslyPublished: value })}
              />
              <span className="capitalize">{value}</span>
            </label>
          ))}
        </div>

        {state.previouslyPublished === "yes" ? (
          <textarea
            className="input-base min-h-[80px] text-[16px] sm:text-[15px]"
            placeholder="Where and when was it published? Include any publisher or agreement still in force."
            maxLength={PRIOR_PUBLICATION_DETAIL_MAX}
            value={state.priorPublicationDetail}
            onChange={(e) => set({ priorPublicationDetail: e.target.value })}
          />
        ) : null}
      </div>

      <label className={rowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={state.consequences}
          onChange={(e) => set({ consequences: e.target.checked })}
        />
        <span>{RIGHTS_WORDING.consequences}</span>
      </label>
    </fieldset>
  );
}
