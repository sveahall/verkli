"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/features/author/settings/actions";

const initialState: ActionState = { ok: false, message: "" };

type SettingsSectionFormProps = {
  title: string;
  description?: React.ReactNode;
  /** Control rendered beside the title, e.g. a section-level master switch. */
  titleAside?: React.ReactNode;
  action: (previous: ActionState, data: FormData) => Promise<ActionState>;
  /** Copy for the idle save bar, e.g. what this page is responsible for. */
  idleMessage?: string;
  saveLabel?: string;
  /** Called with the saved result so a section can clear write-only inputs. */
  onSaved?: (result: ActionState) => void;
  children: React.ReactNode;
};

/**
 * One settings page: a titled card, its own form, its own save bar.
 *
 * Each section posts only its own fields now that they live on separate routes,
 * which is why every action does a partial update rather than rewriting the
 * whole preference blob — see `updatePreferences` in the actions module.
 */
export default function SettingsSectionForm({
  title,
  description,
  titleAside,
  action,
  idleMessage = "Changes are saved to your account.",
  saveLabel = "Save",
  onSaved,
  children,
}: SettingsSectionFormProps) {
  const [edited, setEdited] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    setEdited(false);
    try {
      const result = await action(previous, data);
      onSaved?.(result);
      return result;
    } catch {
      return { ok: false, message: "Could not save. Please try again." };
    }
  }, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        // Dispatch outside the host form action to retain controlled values.
        startTransition(() => formAction(data));
      }}
      // React resets the form after a successful action, which would blank the
      // controlled inputs this page renders. Keep the values on screen.
      onReset={(event) => event.preventDefault()}
      onChange={() => setEdited(true)}
    >
      <fieldset disabled={pending} className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card">
        <section className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-medium">{title}</h2>
              {description ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div> : null}
            </div>
            {titleAside}
          </div>
          <div className="mt-5">{children}</div>
        </section>
      </fieldset>
      <div className="sticky bottom-20 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-surface-sm lg:bottom-4">
        <p
          role={state.message && !state.ok && !edited && !pending ? "alert" : "status"}
          aria-live="polite"
          className={`min-h-5 text-sm ${
            !edited && state.message && !pending
              ? state.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          }`}
        >
          {pending ? "Saving…" : edited ? "Unsaved changes" : state.message || idleMessage}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto min-h-11 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
}
