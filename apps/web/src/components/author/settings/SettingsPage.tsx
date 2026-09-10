"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import {
  saveAuthorSettings,
  signOutAllSessions,
  type ActionState,
} from "@/features/author/settings/actions";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";

const initialState: ActionState = { ok: false, message: "" };

interface ProfilePreferences {
  default_language?: string;
  default_visibility?: string;
  visibility?: { shelves?: string; books?: string };
  notifications?: { email?: boolean };
  [key: string]: unknown;
}

type SettingsPageProps = {
  user: {
    email: string;
  };
  profile: {
    preferences: ProfilePreferences;
  };
  subscriptionPlanSection?: React.ReactNode;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:bg-primary/90 hover:shadow-[0_6px_16px_rgba(15,23,42,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save settings"}
    </button>
  );
}

function InlineFeedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {state.message}
    </p>
  );
}

export default function SettingsPage({ user, profile, subscriptionPlanSection }: SettingsPageProps) {
  const preferences = useMemo(() => profile.preferences || {}, [profile.preferences]);
  const [emailNotifications, setEmailNotifications] = useState(
    preferences.notifications?.email ?? true
  );
  const [state, formAction] = useActionState(saveAuthorSettings, initialState);
  const defaultLanguage =
    (typeof preferences.default_language === "string" && preferences.default_language.trim()) ||
    "sv";
  const defaultVisibility =
    (typeof preferences.default_visibility === "string" && preferences.default_visibility.trim()) ||
    preferences.visibility?.books ||
    preferences.visibility?.shelves ||
    "public";

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="author-page-title">
            Settings
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <>
        <form action={formAction} className="space-y-4">
          <div className="flex justify-end">
            <SaveButton />
          </div>

          <section className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 dark:bg-card">
            <h2 className="author-section-title text-section-title">Account</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="author-settings-email" className="text-sm font-medium text-foreground dark:text-foreground">
                  Email
                </label>
                <input
                  id="author-settings-email"
                  value={user.email}
                  readOnly
                  className="input-base min-h-[44px] text-[14px] text-muted-foreground dark:text-muted-foreground"
                />
              </div>
              <div />
              <div className="space-y-2">
                <label htmlFor="author-settings-password" className="text-sm font-medium text-foreground dark:text-foreground">
                  Password
                </label>
                <input
                  type="password"
                  id="author-settings-password"
                  name="new_password"
                  placeholder="New password"
                  className="input-base min-h-[44px] text-[14px]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="author-settings-confirm-password" className="text-sm font-medium text-foreground dark:text-foreground">
                  Confirm password
                </label>
                <input
                  type="password"
                  id="author-settings-confirm-password"
                  name="confirm_password"
                  placeholder="Confirm password"
                  className="input-base min-h-[44px] text-[14px]"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 dark:bg-card">
            <h2 className="author-section-title text-section-title">Publishing defaults</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="author-settings-language" className="text-sm font-medium text-foreground dark:text-foreground">
                  Language
                </label>
                <select
                  id="author-settings-language"
                  name="default_language"
                  defaultValue={defaultLanguage}
                  className="input-base min-h-[44px] text-[14px]"
                >
                  <option value="sv">Swedish</option>
                  <option value="en">English</option>
                  <option value="de">German</option>
                  <option value="fr">French</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="author-settings-visibility" className="text-sm font-medium text-foreground dark:text-foreground">
                  Default visibility
                </label>
                <select
                  id="author-settings-visibility"
                  name="default_visibility"
                  defaultValue={defaultVisibility}
                  className="input-base min-h-[44px] text-[14px]"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 dark:bg-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="author-section-title text-section-title">Notifications</h2>
                <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
                  Choose whether Verkli should email you about activity.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <span className="sr-only">Email activity notifications</span>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(event) => setEmailNotifications(event.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`h-6 w-11 rounded-full transition ${
                    emailNotifications ? "bg-[#907AFF] dark:bg-[#907AFF]" : "bg-muted dark:bg-card"
                  }`}
                />
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
                    emailNotifications ? "translate-x-5" : "dark:bg-card"
                  }`}
                />
              </label>
              <input
                type="hidden"
                name="email_notifications"
                value={emailNotifications ? "true" : "false"}
              />
            </div>
          </section>

          <InlineFeedback state={state} />
        </form>

        {subscriptionPlanSection ? (
          <div className="mt-4">{subscriptionPlanSection}</div>
        ) : null}

        <section className="mt-4 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 dark:bg-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="author-section-title text-section-title">Sign out</h2>
              <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
                Sign out from all devices.
              </p>
            </div>
            <form action={signOutAllSessions}>
              <button
                type="submit"
                className="min-h-[44px] rounded-full border border-red-200 px-5 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>
        </>
      }
    />
  );
}
