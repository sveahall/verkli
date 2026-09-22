"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { ArrowUpRight, Bell, BookOpen, CreditCard, LockKeyhole, Sparkles, UserRound } from "lucide-react";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { saveAuthorSettings, signOutAllSessions, type ActionState } from "@/features/author/settings/actions";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import AiSettingsSection from "@/features/ai-team/settings/AiSettingsSection";
import type { AiSettings } from "@/features/ai-team/settings/contracts";

const initialState: ActionState = { ok: false, message: "" };
const productionActions = { saveAuthorSettings, signOutAllSessions };
const sections = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "security", label: "Security", icon: LockKeyhole },
  { id: "defaults", label: "Publishing defaults", icon: BookOpen },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "billing", label: "Billing & subscriptions", icon: CreditCard },
];

interface ProfilePreferences {
  default_language?: string;
  default_visibility?: string;
  visibility?: { shelves?: string; books?: string };
  notifications?: { email?: boolean };
  [key: string]: unknown;
}

type SettingsPageProps = {
  user: { email: string };
  profile: { preferences: ProfilePreferences };
  /** Account AI preferences. Saved by the same form as everything else. */
  aiSettings: AiSettings;
  subscriptionPlanSection?: React.ReactNode;
  actions?: typeof productionActions;
  headerActions?: React.ReactNode;
};

export default function SettingsPage({ user, profile, aiSettings, subscriptionPlanSection, actions = productionActions, headerActions }: SettingsPageProps) {
  const preferences = useMemo(() => profile.preferences || {}, [profile.preferences]);
  const [emailNotifications, setEmailNotifications] = useState(preferences.notifications?.email ?? true);
  const [language, setLanguage] = useState((typeof preferences.default_language === "string" && preferences.default_language.trim()) || "sv");
  const [visibility, setVisibility] = useState((typeof preferences.default_visibility === "string" && preferences.default_visibility.trim()) || preferences.visibility?.books || preferences.visibility?.shelves || "public");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [edited, setEdited] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    setEdited(false);
    try {
      const result = await actions.saveAuthorSettings(previous, data);
      if (result.ok) {
        setPassword("");
        setConfirmPassword("");
      }
      return result;
    } catch {
      return { ok: false, message: "Could not save settings. Please try again." };
    }
  }, initialState);

  return (
    <WorkspaceLayout
      header={<header><h1 className="author-page-title">Settings</h1><p className="mt-1 text-sm text-muted-foreground">A studio that works your way.</p></header>}
      headerRight={headerActions === undefined ? <WorkspaceHeaderActions /> : headerActions}
      main={
        <div className="@container/settings mx-auto max-w-6xl">
          <div className="grid items-start gap-6 @min-[880px]/settings:grid-cols-[200px_minmax(0,1fr)] @min-[880px]/settings:gap-8">
            <nav aria-label="Settings sections" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2 @min-[880px]/settings:sticky @min-[880px]/settings:top-5 @min-[880px]/settings:flex-col @min-[880px]/settings:rounded-none @min-[880px]/settings:border-0 @min-[880px]/settings:bg-transparent @min-[880px]/settings:p-0">
              {sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#settings-${id}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Icon size={16} className="shrink-0" />{label}</a>)}
            </nav>

            <div className="min-w-0 space-y-6">
              <form action={formAction} onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  // Dispatch outside the host form action to retain controlled values.
                  startTransition(() => formAction(data));
                }} onReset={(event) => event.preventDefault()} onChange={() => setEdited(true)}>
                <fieldset disabled={pending} className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card">
                  <section id="settings-account" aria-labelledby="settings-account-title" className="scroll-mt-6 p-5 sm:p-7">
                    <h2 id="settings-account-title" className="font-display text-xl font-medium">Account</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Your sign-in details for Verkli.</p>
                    <div className="mt-5 space-y-2"><label htmlFor="author-settings-email" className="text-sm font-medium">Email</label><input id="author-settings-email" type="email" value={user.email} readOnly aria-describedby="settings-email-hint" className="input-base min-h-11 bg-muted/40 text-base text-muted-foreground sm:text-sm" /><p id="settings-email-hint" className="text-xs text-muted-foreground">Your account email is shown here for reference.</p></div>
                  </section>

                  <section id="settings-security" aria-labelledby="settings-security-title" className="scroll-mt-6 border-t border-border p-5 sm:p-7">
                    <h2 id="settings-security-title" className="font-display text-xl font-medium">Security</h2>
                    <p id="settings-password-hint" className="mt-2 text-sm leading-relaxed text-muted-foreground">Leave both fields empty to keep your current password. A new password needs at least 8 characters.</p>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><label htmlFor="author-settings-password" className="text-sm font-medium">New password</label><input type="password" id="author-settings-password" name="new_password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="settings-password-hint" className="input-base min-h-11 text-base sm:text-sm" /></div>
                      <div className="space-y-2"><label htmlFor="author-settings-confirm-password" className="text-sm font-medium">Confirm new password</label><input type="password" id="author-settings-confirm-password" name="confirm_password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-describedby="settings-password-hint" className="input-base min-h-11 text-base sm:text-sm" /></div>
                    </div>
                  </section>

                  <section id="settings-defaults" aria-labelledby="settings-defaults-title" className="scroll-mt-6 border-t border-border p-5 sm:p-7">
                    <h2 id="settings-defaults-title" className="font-display text-xl font-medium">Publishing defaults</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Set your preferred language and visibility.</p>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><label htmlFor="author-settings-language" className="text-sm font-medium">Language</label><select id="author-settings-language" name="default_language" value={language} onChange={(event) => setLanguage(event.target.value)} className="input-base min-h-11 text-base sm:text-sm"><option value="sv">Swedish</option><option value="en">English</option><option value="de">German</option><option value="fr">French</option></select></div>
                      <div className="space-y-2"><label htmlFor="author-settings-visibility" className="text-sm font-medium">Default visibility</label><select id="author-settings-visibility" name="default_visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)} className="input-base min-h-11 text-base sm:text-sm"><option value="public">Public</option><option value="private">Private</option></select></div>
                    </div>
                  </section>

                  <section id="settings-notifications" aria-labelledby="settings-notifications-title" className="scroll-mt-6 border-t border-border p-5 sm:p-7">
                    <div className="flex items-start justify-between gap-5">
                      <div><h2 id="settings-notifications-title" className="font-display text-xl font-medium">Notifications</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Email me about activity on Verkli.</p></div>
                      <label className="relative inline-flex min-h-11 w-12 shrink-0 cursor-pointer items-center"><input type="checkbox" aria-label="Email activity notifications" checked={emailNotifications} onChange={(event) => setEmailNotifications(event.target.checked)} className="peer sr-only" /><span className={`relative h-7 w-12 rounded-full border border-border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring ${emailNotifications ? "bg-primary" : "bg-muted"}`}><span className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full shadow-sm transition-transform ${emailNotifications ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} /></span></label>
                      <input type="hidden" name="email_notifications" value={emailNotifications ? "true" : "false"} />
                    </div>
                  </section>

                  <AiSettingsSection settings={aiSettings} />
                </fieldset>
                <div className="sticky bottom-20 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-surface-sm lg:bottom-4">
                  <p role={state.message && !state.ok && !edited && !pending ? "alert" : "status"} aria-live="polite" className={`min-h-5 text-sm ${!edited && state.message && !pending ? state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{pending ? "Saving your settings…" : edited ? "Unsaved changes" : state.message || "Save account preferences together."}</p>
                  <button type="submit" disabled={pending} className="ml-auto min-h-11 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save settings"}</button>
                </div>
              </form>

              <section id="settings-billing" aria-labelledby="settings-billing-title" className="scroll-mt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 px-1"><div><h2 id="settings-billing-title" className="font-display text-xl font-medium">Billing &amp; subscriptions</h2><p className="mt-2 text-sm text-muted-foreground">Manage your Verkli plan and reader memberships.</p></div><a href="/author/billing" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent">Open billing<ArrowUpRight size={15} /></a></div>
                {subscriptionPlanSection}
              </section>

              <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5 sm:p-6" aria-labelledby="settings-signout-title">
                <div><h2 id="settings-signout-title" className="text-sm font-medium">Sign out everywhere</h2><p className="mt-1 text-sm text-muted-foreground">End your sessions on all devices, including this one.</p></div>
                <form action={actions.signOutAllSessions}><button type="submit" className="min-h-11 rounded-full border border-border bg-card px-5 py-2 text-sm font-medium transition-colors hover:bg-accent">Sign out</button></form>
              </section>
            </div>
          </div>
        </div>
      }
    />
  );
}
