"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { uploadAvatar } from "@/lib/supabase/storage";
import {
  updateAccount,
  updateProfile,
  updateAvatarPath,
  updatePreferences,
  switchRoleToReader,
  changePassword,
  signOutAllSessions,
  type ActionState,
} from "@/features/author/settings/actions";

const initialState: ActionState = { ok: false, message: "" };

const fontOptions = [
  "Inter",
  "Sora",
  "Playfair Display",
  "Merriweather",
];

interface ProfilePreferences {
  typography?: { fontFamily?: string; fontWeight?: string; titleSize?: string; subtitleSize?: string; textColor?: string };
  cover_style?: string;
  visibility?: { shelves?: string; books?: string };
  [key: string]: unknown;
}

type SettingsPageProps = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    displayName: string;
    username: string;
    bio: string;
    avatarUrl: string;
    isPublic: boolean;
    role: string;
    preferences: ProfilePreferences;
  };
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] min-w-[44px] rounded-full bg-[#907AFF] px-5 py-2 text-[13px] font-semibold text-white transition-all hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 focus:ring-offset-background"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function InlineFeedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={`text-helper ${state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {state.message}
    </p>
  );
}

export default function SettingsPage({ user, profile }: SettingsPageProps) {

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);

  const preferences = useMemo(() => profile.preferences || {}, [profile.preferences]);

  const [fontFamily, setFontFamily] = useState(preferences?.typography?.fontFamily || "Inter");
  const [fontWeight, setFontWeight] = useState(preferences?.typography?.fontWeight || "600");
  const [titleSize, setTitleSize] = useState(preferences?.typography?.titleSize || "20px");
  const [subtitleSize, setSubtitleSize] = useState(preferences?.typography?.subtitleSize || "14px");
  const [textColor, setTextColor] = useState(preferences?.typography?.textColor || "#111827");
  const [coverStyle, setCoverStyle] = useState(preferences?.cover_style || "image");
  const [visibilityShelves, setVisibilityShelves] = useState(preferences?.visibility?.shelves || "public");
  const [visibilityBooks, setVisibilityBooks] = useState(preferences?.visibility?.books || "public");

  const [accountState, accountAction] = useActionState(updateAccount, initialState);
  const [profileState, profileAction] = useActionState(updateProfile, initialState);
  const [prefsState, prefsAction] = useActionState(updatePreferences, initialState);
  const [passwordState, passwordAction] = useActionState(changePassword, initialState);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    const { path, url, error } = await uploadAvatar(file, user.id);

    if (error || !path) {
      setAvatarUploading(false);
      if (process.env.NODE_ENV === "development") {
        console.error("[avatar upload failed]", error);
      }
      return;
    }

    const result = await updateAvatarPath(path);
    setAvatarUploading(false);
    if (!result.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[avatar profile update failed]");
      }
      return;
    }
    setAvatarUrl(url ?? "");
  };

  return (
    <main className="min-h-screen min-h-dvh bg-background text-foreground">
      <div className="page-content mx-auto max-w-[1200px] section-gap pb-24 pt-8 sm:pt-10">
        <header className="space-y-2">
          <h1 className="text-page-title">author settings</h1>
          <p className="text-body max-w-2xl">
            Manage your public profile, defaults, and security preferences.
          </p>
        </header>

        <section className="card-base p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-section-title">Account</h2>
              <p className="text-[14px] text-slate-600 dark:text-white/50">Update your display name and username.</p>
            </div>
          </div>
          <form action={accountAction} className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Display name</label>
              <input
                name="display_name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Username</label>
              <input
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Email</label>
              <input
                value={user.email}
                readOnly
                className="w-full rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-[14px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50"
              />
            </div>
            <div className="flex items-end justify-between gap-4">
              <InlineFeedback state={accountState} />
              <SaveButton label="Save changes" />
            </div>
          </form>
        </section>

        <section className="card-base p-6 sm:p-8">
          <div>
            <h2 className="text-section-title">Profile</h2>
            <p className="text-[14px] text-slate-600 dark:text-white/50">Public details visible on your author page.</p>
          </div>
          <form action={profileAction} className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Bio</label>
                <textarea
                  name="bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={5}
                  className="min-h-[120px] w-full resize-none rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-[#0b0b10]">
                <div>
                  <p className="text-[14px] font-medium text-slate-900 dark:text-white">Public profile</p>
                  <p className="text-[12px] text-slate-500 dark:text-white/50">Toggle visibility for readers.</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(event) => setIsPublic(event.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`h-6 w-11 rounded-full transition ${
                      isPublic ? "bg-[#907AFF]" : "bg-black/[0.02]0 dark:bg-white/20"
                    }`}
                  />
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
                      isPublic ? "translate-x-5" : "" 
                    }`}
                  />
                </label>
                <input type="hidden" name="is_public" value={isPublic ? "true" : "false"} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-black/10 bg-white/80 p-5 dark:border-white/10 dark:bg-[#0b0b10]">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Avatar</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-full border border-black/10 bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 dark:border-white/10">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[24px] font-semibold text-slate-900 dark:text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-black/[0.02] px-4 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[#907AFF]/30 focus-within:ring-offset-2">
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                      {avatarUploading ? "Uploading..." : "Upload new"}
                    </label>
                    <p className="mt-2 text-[12px] text-slate-500 dark:text-white/40">PNG, JPG up to 2MB.</p>
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-4">
                <InlineFeedback state={profileState} />
                <SaveButton label="Save changes" />
              </div>
            </div>
          </form>
        </section>

        <section className="card-base p-6 sm:p-8">
          <div>
            <h2 className="text-section-title">author preferences</h2>
            <p className="text-[14px] text-slate-600 dark:text-white/50">Defaults used when you create new shelves.</p>
          </div>
          <form action={prefsAction} className="mt-6 grid gap-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Font family</label>
                <select
                  name="typography_font_family"
                  value={fontFamily}
                  onChange={(event) => setFontFamily(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                >
                  {fontOptions.map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Font weight</label>
                <input
                  name="typography_font_weight"
                  value={fontWeight}
                  onChange={(event) => setFontWeight(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Title size</label>
                <input
                  name="typography_title_size"
                  value={titleSize}
                  onChange={(event) => setTitleSize(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Subtitle size</label>
                <input
                  name="typography_subtitle_size"
                  value={subtitleSize}
                  onChange={(event) => setSubtitleSize(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Text color</label>
                <input
                  name="typography_text_color"
                  value={textColor}
                  onChange={(event) => setTextColor(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Default cover style</p>
                <div className="flex gap-3">
                  {(["image", "gradient"] as const).map((option) => (
                    <label key={option} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium ${
                      coverStyle === option
                        ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-slate-900 dark:text-white"
                        : "border-black/10 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white/60"
                    }`}>
                      <input
                        type="radio"
                        name="cover_style"
                        value={option}
                        checked={coverStyle === option}
                        onChange={() => setCoverStyle(option)}
                        className="hidden"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Default shelf visibility</label>
                <select
                  name="visibility_shelves"
                  value={visibilityShelves}
                  onChange={(event) => setVisibilityShelves(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Default book visibility</label>
                <select
                  name="visibility_books"
                  value={visibilityBooks}
                  onChange={(event) => setVisibilityBooks(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 focus:ring-offset-0 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <InlineFeedback state={prefsState} />
              <SaveButton label="Save changes" />
            </div>
          </form>
        </section>

        <section className="card-base p-6 sm:p-8">
          <div>
            <h2 className="text-section-title">Role</h2>
            <p className="text-[14px] text-slate-600 dark:text-white/50">You are currently signed in as a author.</p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-[13px] font-semibold uppercase tracking-wider text-slate-700 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white/70">
              Current role: {profile.role}
            </div>
            <button
              type="button"
              onClick={() => setShowRoleModal(true)}
              className="rounded-full border border-black/10 bg-black/[0.02] px-5 py-2 text-[13px] font-semibold text-slate-700 transition-all hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
            >
              Switch to reader
            </button>
          </div>
        </section>

        <section className="card-base p-6 sm:p-8">
          <div>
            <h2 className="text-section-title">Security</h2>
            <p className="text-[14px] text-slate-600 dark:text-white/50">Change your password or sign out everywhere.</p>
          </div>
          <form action={passwordAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <input
              type="password"
              name="new_password"
              placeholder="New password"
              className="min-h-[44px] rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
            />
            <input
              type="password"
              name="confirm_password"
              placeholder="Confirm password"
              className="min-h-[44px] rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
            />
            <div className="flex items-center justify-between gap-4 md:col-span-2">
              <InlineFeedback state={passwordState} />
              <SaveButton label="Update password" />
            </div>
          </form>
          <form action={signOutAllSessions} className="mt-6 flex items-center justify-between rounded-2xl border border-black/10 bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-[#0b0b10]">
            <div>
              <p className="text-[14px] font-medium text-slate-900 dark:text-white">Sign out everywhere</p>
              <p className="text-[12px] text-slate-500 dark:text-white/40">This will revoke all active sessions.</p>
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-full border border-red-200 bg-red-50 px-4 py-2 text-[12px] font-semibold text-red-600 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              Sign out all
            </button>
          </form>
        </section>
      </div>

      {showRoleModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm safe-area-inset">
          <div className="w-full max-w-[420px] max-h-[min(90dvh,32rem)] overflow-y-auto rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#0a0a0f] sm:rounded-3xl sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Switch to reader?</h3>
            <p className="mt-2 text-[14px] text-slate-600 dark:text-white/50">
              You can always switch back later. Your author data stays intact.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="min-h-[44px] rounded-full border border-black/10 bg-black/[0.02] px-4 py-2 text-[12px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/30 focus:ring-offset-2"
              >
                Cancel
              </button>
              <form action={switchRoleToReader}>
                <SaveButton label="Switch role" />
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
