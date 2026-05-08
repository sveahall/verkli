"use client";

import Image from "next/image";
import { useActionState, useState, useRef, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Globe, Twitter, Instagram, Sparkles, Eye, EyeOff } from "lucide-react";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import {
  saveAuthorProfile,
  updateAvatarPath,
  updateCoverImagePath,
  type ActionState,
} from "@/features/author/settings/actions";
import { uploadAvatar, uploadProfileCover } from "@/lib/supabase/storage";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";

const initialState: ActionState = { ok: false, message: "" };

type SocialLinks = {
  twitter: string;
  instagram: string;
  tiktok: string;
};

type ProfilePageProps = {
  user: { id: string };
  profile: {
    displayName: string;
    bio: string;
    avatarUrl?: string | null;
    coverImageUrl?: string | null;
    isPublic: boolean;
    websiteUrl: string;
    socialLinks: SocialLinks;
  };
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-full bg-[#0F172A] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E293B] hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

function InlineFeedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`text-sm font-medium ${
        state.ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {state.message}
    </p>
  );
}

export default function ProfilePage({ user, profile }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(profile.coverImageUrl ?? "");
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(profile.socialLinks);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [state, formAction] = useActionState(saveAuthorProfile, initialState);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    const { path, url, error } = await uploadAvatar(file, user.id);
    if (error || !path) {
      setAvatarUploading(false);
      setAvatarError("Upload failed. PNG, JPG or WebP, max 2 MB.");
      return;
    }
    const result = await updateAvatarPath(path);
    setAvatarUploading(false);
    if (!result.ok) {
      setAvatarError("Could not save avatar.");
      return;
    }
    setAvatarUrl(url ?? "");
  };

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverError(null);
    const { path, url, error } = await uploadProfileCover(file, user.id);
    if (error || !path) {
      setCoverUploading(false);
      setCoverError("Upload failed. PNG, JPG or WebP, max 5 MB.");
      return;
    }
    const result = await updateCoverImagePath(path);
    setCoverUploading(false);
    if (!result.ok) {
      setCoverError("Could not save cover image.");
      return;
    }
    setCoverImageUrl(url ?? "");
  };

  const updateSocial = (key: keyof SocialLinks, value: string) =>
    setSocialLinks((prev) => ({ ...prev, [key]: value }));

  return (
    <WorkspaceLayout className="bg-gray-50"
      header={
        <header>
          <h1 className="text-[22px] font-medium tracking-tight text-slate-900 dark:text-white">
            Profile
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <form action={formAction} className="mx-auto max-w-4xl space-y-3">

          {/* ── Cover + Avatar ── */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04]">
            <div className="relative h-[200px] w-full overflow-hidden bg-slate-100 dark:bg-white/[0.03]">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt="Cover"
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/10">
                    <Camera className="h-4 w-4 text-slate-400 dark:text-white/30" />
                  </div>
                  <p className="text-xs font-medium text-slate-400 dark:text-white/30">
                    Add cover photo
                  </p>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity hover:opacity-100 bg-black/35">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white active:scale-[0.97]"
                >
                  <Camera className="h-4 w-4" />
                  {coverUploading ? "Uploading…" : "Change cover"}
                </button>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverChange}
              />
              {/* Always-visible corner button */}
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/65 active:scale-[0.97]"
              >
                <Camera className="h-3.5 w-3.5" />
                {coverUploading ? "Uploading…" : "Edit cover"}
              </button>
            </div>

            {coverError && (
              <p className="px-6 pt-2 text-sm text-red-600 dark:text-red-400">{coverError}</p>
            )}

            {/* Avatar + name row */}
            <div className="px-6 pb-6">
              <div className="flex items-end gap-4 -mt-11">
                <div className="relative flex-shrink-0">
                  <div
                    className="relative h-[88px] w-[88px] cursor-pointer overflow-hidden rounded-2xl border-[3px] border-white dark:border-[#1a1a2e] shadow-md"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="Avatar"
                        fill
                        sizes="88px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#0F172A] text-2xl font-bold text-white">
                        {initials}
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                      <Camera className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  {avatarUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  )}
                </div>

                <div className="flex-1 pb-1">
                  <p className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
                    {displayName || "Your Name"}
                  </p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="mt-0.5 text-xs text-slate-500 transition hover:text-[#907AFF] dark:text-white/40 dark:hover:text-[#907AFF]"
                  >
                    {avatarUploading ? "Uploading…" : "Change photo"}
                  </button>
                  {avatarError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{avatarError}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Pen name ── */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Pen name</p>
            <p className="mb-3 text-xs text-slate-500 dark:text-white/40">
              The name readers see on your books and profile page.
            </p>
            <input
              name="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your author name"
              className="input-base"
            />
          </section>

          {/* ── About me ── */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">About me</p>
              <span className="rounded-full bg-[#907AFF]/10 px-2 py-0.5 text-xs font-medium text-[#907AFF]">
                Visible on public page
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-white/40">
              Tell readers about your writing style, inspiration, and what makes your stories unique.
            </p>
            <textarea
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              placeholder="e.g. I write dark fantasy with complex characters…"
              className="input-base min-h-[120px] resize-y leading-relaxed"
            />
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-[#907AFF] transition-all duration-300"
                  style={{ width: `${Math.min((bio.length / 500) * 100, 100)}%` }}
                />
              </div>
              <p className="flex-shrink-0 text-xs tabular-nums text-slate-400 dark:text-white/35">
                {bio.length}<span className="text-slate-300 dark:text-white/20">/500</span>
              </p>
            </div>
          </section>

          {/* ── Links ── */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Links</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
                  <Globe className="h-4 w-4 text-slate-500 dark:text-white/50" />
                </div>
                <input
                  name="website_url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  type="url"
                  className="input-base flex-1"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
                  <Twitter className="h-4 w-4 text-slate-500 dark:text-white/50" />
                </div>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-white/30">
                    @
                  </span>
                  <input
                    name="social_twitter"
                    value={socialLinks.twitter}
                    onChange={(e) => updateSocial("twitter", e.target.value)}
                    placeholder="username"
                    className="input-base w-full pl-7"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
                  <Instagram className="h-4 w-4 text-slate-500 dark:text-white/50" />
                </div>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-white/30">
                    @
                  </span>
                  <input
                    name="social_instagram"
                    value={socialLinks.instagram}
                    onChange={(e) => updateSocial("instagram", e.target.value)}
                    placeholder="username"
                    className="input-base w-full pl-7"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
                  <Sparkles className="h-4 w-4 text-slate-500 dark:text-white/50" />
                </div>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-white/30">
                    @
                  </span>
                  <input
                    name="social_tiktok"
                    value={socialLinks.tiktok}
                    onChange={(e) => updateSocial("tiktok", e.target.value)}
                    placeholder="username"
                    className="input-base w-full pl-7"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Public profile ── */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition ${isPublic ? "bg-[#907AFF]/15" : "bg-slate-100 dark:bg-white/[0.06]"}`}>
                  {isPublic ? (
                    <Eye className="h-4 w-4 text-[#907AFF]" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-slate-500 dark:text-white/40" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Public profile</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/45 max-w-xs leading-relaxed">
                    {isPublic
                      ? "Readers can discover your author page and books in the library."
                      : "Your profile is hidden from readers and discovery."}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex flex-shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`block h-6 w-11 rounded-full transition-colors duration-200 ${
                    isPublic ? "bg-[#907AFF]" : "bg-slate-200 dark:bg-white/20"
                  }`}
                />
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    isPublic ? "translate-x-5" : ""
                  }`}
                />
              </label>
              <input type="hidden" name="is_public" value={isPublic ? "true" : "false"} />
            </div>
          </section>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
            <InlineFeedback state={state} />
            <div className="ml-auto">
              <SaveButton />
            </div>
          </div>
        </form>
      }
    />
  );
}
