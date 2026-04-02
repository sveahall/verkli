"use client";

import Image from "next/image";
import { useActionState, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import {
  saveAuthorProfile,
  updateAvatarPath,
  type ActionState,
} from "@/features/author/settings/actions";
import { uploadAvatar } from "@/lib/supabase/storage";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";

const initialState: ActionState = { ok: false, message: "" };

type ProfilePageProps = {
  user: {
    id: string;
  };
  profile: {
    displayName: string;
    bio: string;
    avatarUrl?: string | null;
    isPublic: boolean;
  };
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(124,108,255,0.3)] transition hover:shadow-[0_6px_16px_rgba(124,108,255,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save profile"}
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

export default function ProfilePage({ user, profile }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [state, formAction] = useActionState(saveAuthorProfile, initialState);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    const { path, url, error } = await uploadAvatar(file, user.id);

    if (error || !path) {
      setAvatarUploading(false);
      return;
    }

    const result = await updateAvatarPath(path);
    setAvatarUploading(false);
    if (!result.ok) {
      return;
    }

    setAvatarUrl(url ?? "");
  };

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
            Profile
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <form action={formAction} className="space-y-4">
          <div className="flex justify-end">
            <SaveButton />
          </div>

          <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
            <h2 className="text-section-title">Avatar</h2>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-white/[0.04]">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[24px] font-semibold text-slate-900 dark:text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:border-white/20 dark:hover:text-white">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  {avatarUploading ? "Uploading..." : "Upload avatar"}
                </label>
                <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
                  PNG or JPG, up to 2 MB.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
            <h2 className="text-section-title">Display name</h2>
            <input
              name="display_name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="input-base mt-4 min-h-[44px] text-[14px]"
            />
          </section>

          <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
            <h2 className="text-section-title">Bio</h2>
            <textarea
              name="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={6}
              className="input-base mt-4 min-h-[140px] resize-y text-[14px]"
            />
          </section>

          <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-section-title">Public profile</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
                  Turn your public author page on or off.
                </p>
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
                    isPublic ? "bg-[#907AFF] dark:bg-[#907AFF]" : "bg-slate-200 dark:bg-white/20"
                  }`}
                />
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
                    isPublic ? "translate-x-5" : "dark:bg-slate-900"
                  }`}
                />
              </label>
              <input type="hidden" name="is_public" value={isPublic ? "true" : "false"} />
            </div>
          </section>

          <InlineFeedback state={state} />
        </form>
      }
    />
  );
}
