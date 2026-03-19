"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { PageHeader } from "@/components/ui/page-header";
import {
  saveAuthorSettings,
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
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-full bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
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

export default function SettingsPage({ user, profile }: SettingsPageProps) {
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
        <PageHeader
          eyebrow="Settings"
          title="Settings"
          description="Manage account security, publishing defaults, and notifications."
        />
      }
      main={
        <form action={formAction} className="space-y-8">
          <div className="flex justify-end">
            <SaveButton />
          </div>

          <section className="border-t border-slate-200/80 pt-6 dark:border-white/10">
            <h2 className="text-section-title">Account</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Email
                </label>
                <input
                  value={user.email}
                  readOnly
                  className="input-base min-h-[44px] text-[14px] text-slate-500 dark:text-white/50"
                />
              </div>
              <div />
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Password
                </label>
                <input
                  type="password"
                  name="new_password"
                  placeholder="New password"
                  className="input-base min-h-[44px] text-[14px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Confirm password
                </label>
                <input
                  type="password"
                  name="confirm_password"
                  placeholder="Confirm password"
                  className="input-base min-h-[44px] text-[14px]"
                />
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200/80 pt-6 dark:border-white/10">
            <h2 className="text-section-title">Publishing defaults</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Language
                </label>
                <select
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
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  Default visibility
                </label>
                <select
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

          <section className="border-t border-slate-200/80 pt-6 dark:border-white/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-section-title">Notifications</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
                  Choose whether Verkli should email you about activity.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(event) => setEmailNotifications(event.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`h-6 w-11 rounded-full transition ${
                    emailNotifications ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-white/20"
                  }`}
                />
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition dark:bg-slate-900 ${
                    emailNotifications ? "translate-x-5 dark:bg-slate-900" : ""
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
      }
    />
  );
}
