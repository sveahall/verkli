"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/supabase/storage";

type ReaderSettingsFormProps = {
  userId: string;
  email: string;
  initialProfile: {
    displayName: string;
    username: string;
    bio: string;
    avatarUrl: string;
    isPublic: boolean;
  };
};

export default function ReaderSettingsForm({ userId, email, initialProfile }: ReaderSettingsFormProps) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [username, setUsername] = useState(initialProfile.username);
  const [bio, setBio] = useState(initialProfile.bio);
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl);
  const [isPublic, setIsPublic] = useState(initialProfile.isPublic);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    const { url, error } = await uploadAvatar(file, userId);
    setAvatarUploading(false);

    if (error || !url) {
      setMessage("Failed to upload avatar.");
      return;
    }

    setAvatarUrl(url);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    const supabase = createClient();
    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: cleanDisplayName || null,
          username: cleanUsername || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl || null,
          is_public: isPublic,
          role: "reader",
        },
        { onConflict: "user_id" }
      );

    if (!profileError) {
      await supabase.auth.updateUser({
        data: {
          full_name: cleanDisplayName,
          username: cleanUsername,
          role: "reader",
        },
      });
      setMessage("Settings saved.");
    } else {
      setMessage(profileError.message || "Could not save settings.");
    }

    setSaving(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-3xl border border-black/10 bg-black/[0.04] p-6 dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Profile</h2>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-white/50">Update your public reader profile.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Display name</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-xl border border-black/10 bg-black/2 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-black/10 bg-black/2 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Bio</label>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-black/10 bg-black/2 px-4 py-3 text-[14px] text-slate-900 outline-none transition focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full border border-black/10 dark:border-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[20px] font-semibold text-slate-700 dark:text-white/80">
                {displayName ? displayName.charAt(0).toUpperCase() : "R"}
              </div>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-black/2 px-4 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10">
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            {avatarUploading ? "Uploading..." : "Upload avatar"}
          </label>
          <div className="text-[12px] text-slate-500 dark:text-white/40">PNG or JPG up to 2MB.</div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-black/10 bg-black/2 px-4 py-4 dark:border-white/10 dark:bg-white/5">
          <div>
            <p className="text-[14px] font-medium text-slate-900 dark:text-white">Public profile</p>
            <p className="text-[12px] text-slate-600 dark:text-white/50">Allow readers to see your profile.</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="sr-only"
            />
            <span className={`h-6 w-11 rounded-full transition ${isPublic ? "bg-[#907AFF]" : "bg-black/20 dark:bg-white/20"}`} />
            <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${isPublic ? "translate-x-5" : ""}`} />
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-black/[0.04] p-6 dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Account</h2>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-white/50">Signed in as {email}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-600 dark:text-white/60">{message}</p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#907AFF] px-5 py-2 text-[13px] font-semibold text-white transition-all hover:bg-[#8069EE] disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
