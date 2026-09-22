"use client";

import { useState } from "react";
import { changePassword, signOutAllSessions } from "@/features/author/settings/actions";
import SettingsSectionForm from "./SettingsSectionForm";

export default function SecuritySection({ action = changePassword, onSignOut }: {
  /** Overridden by the /dev fixture so a preview save never hits the account. */
  action?: typeof changePassword;
  onSignOut?: () => void;
} = {}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <>
      <SettingsSectionForm
        title="Security"
        description="Choose a new password of at least 8 characters. You stay signed in on this device."
        action={action}
        idleMessage="Your password is only changed when you save."
        saveLabel="Update password"
        // Clear the fields only on success: a rejected attempt keeps what was
        // typed so the author can fix a typo instead of retyping both.
        onSaved={(result) => {
          if (result.ok) {
            setPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="author-settings-password" className="text-sm font-medium">New password</label>
            <input
              type="password"
              id="author-settings-password"
              name="new_password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-base min-h-11 text-base sm:text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="author-settings-confirm-password" className="text-sm font-medium">Confirm new password</label>
            <input
              type="password"
              id="author-settings-confirm-password"
              name="confirm_password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="input-base min-h-11 text-base sm:text-sm"
            />
          </div>
        </div>
      </SettingsSectionForm>

      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5 sm:p-6"
        aria-labelledby="settings-signout-title"
      >
        <div>
          <h2 id="settings-signout-title" className="text-sm font-medium">Sign out everywhere</h2>
          <p className="mt-1 text-sm text-muted-foreground">End your sessions on all devices, including this one.</p>
        </div>
        <form action={onSignOut ? undefined : signOutAllSessions} onSubmit={onSignOut ? (event) => { event.preventDefault(); onSignOut(); } : undefined}>
          <button
            type="submit"
            className="min-h-11 rounded-full border border-red-200 px-5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            Sign out
          </button>
        </form>
      </section>
    </>
  );
}
