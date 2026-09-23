"use client";

import Image from "next/image";
import { startTransition, useActionState, useState, useRef, type ChangeEvent, type ReactNode } from "react";
import { Camera, Eye, EyeOff, Globe } from "lucide-react";
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
const productionActions = { saveAuthorProfile, updateAvatarPath, updateCoverImagePath, uploadAvatar, uploadProfileCover };

type SocialLinks = { twitter: string; instagram: string; tiktok: string };
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
  actions?: typeof productionActions;
  headerActions?: ReactNode;
};

export default function ProfilePage({ user, profile, actions = productionActions, headerActions }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(profile.coverImageUrl ?? "");
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(profile.socialLinks);
  const [edited, setEdited] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [state, formAction, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    setEdited(false);
    try {
      return await actions.saveAuthorProfile(previous, data);
    } catch {
      return { ok: false, message: "Could not save profile. Please try again." };
    }
  }, initialState);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const initials = displayName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "A";

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setAvatarUploading(true);
    setAvatarError(null);
    setImageMessage("");
    try {
      const { path, url, error } = await actions.uploadAvatar(file, user.id);
      if (error || !path) {
        setAvatarError("Upload failed. PNG, JPG or WebP, max 2 MB.");
        return;
      }
      const result = await actions.updateAvatarPath(path);
      if (!result.ok) {
        setAvatarError(result.message || "Could not save avatar.");
        return;
      }
      setAvatarUrl(url ?? "");
      setImageMessage("Profile photo saved.");
    } catch {
      setAvatarError("Could not upload your profile photo. Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setCoverUploading(true);
    setCoverError(null);
    setImageMessage("");
    try {
      const { path, url, error } = await actions.uploadProfileCover(file, user.id);
      if (error || !path) {
        setCoverError("Upload failed. PNG, JPG or WebP, max 5 MB.");
        return;
      }
      const result = await actions.updateCoverImagePath(path);
      if (!result.ok) {
        setCoverError(result.message || "Could not save cover image.");
        return;
      }
      setCoverImageUrl(url ?? "");
      setImageMessage("Cover photo saved.");
    } catch {
      setCoverError("Could not upload your cover photo. Please try again.");
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <WorkspaceLayout
      header={<header><h1 className="author-page-title text-foreground">Profile</h1><p className="mt-1 text-sm text-muted-foreground">Your introduction to readers.</p></header>}
      headerRight={headerActions === undefined ? <WorkspaceHeaderActions /> : headerActions}
      main={
        <form action={formAction} onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  // Dispatch outside the host form action to retain controlled values.
                  startTransition(() => formAction(data));
                }} onReset={(event) => event.preventDefault()} onChange={(event) => { if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") setEdited(true); }} className="@container/profile mx-auto max-w-6xl">
          <fieldset disabled={pending} className="grid min-w-0 items-start gap-6 @min-[860px]/profile:grid-cols-[minmax(0,1fr)_340px]">
            <div className="order-2 min-w-0 overflow-hidden rounded-3xl border border-border bg-card @min-[860px]/profile:order-1">
              <section className="space-y-5 p-5 sm:p-7" aria-labelledby="profile-about-title">
                <div><h2 id="profile-about-title" className="font-display text-xl font-medium">Make it yours</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Give readers a name to remember and a reason to explore your stories.</p></div>
                <div className="space-y-2">
                  <label htmlFor="profile-name" className="text-sm font-medium">Pen name</label>
                  <input id="profile-name" name="display_name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your author name" autoComplete="nickname" aria-describedby="profile-name-hint" className="input-base min-h-11 text-base sm:text-sm" />
                  <p id="profile-name-hint" className="text-xs leading-relaxed text-muted-foreground">The name readers see on your books and profile.</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="profile-bio" className="text-sm font-medium">About me</label>
                  <textarea id="profile-bio" name="bio" value={bio} onChange={(event) => setBio(event.target.value)} rows={5} placeholder="What inspires your stories?" aria-describedby="profile-bio-hint" className="input-base min-h-36 resize-y text-base leading-relaxed sm:text-sm" />
                  <div id="profile-bio-hint" className="flex justify-between gap-4 text-xs text-muted-foreground"><span>Your writing, your inspirations, your world.</span><span className="shrink-0 tabular-nums">{bio.length} characters</span></div>
                </div>
              </section>

              <section className="space-y-5 border-t border-border p-5 sm:p-7" aria-labelledby="profile-links-title">
                <div><h2 id="profile-links-title" className="font-display text-xl font-medium">Elsewhere</h2><p className="mt-2 text-sm text-muted-foreground">Help readers find you beyond your books. All links are optional.</p></div>
                <div className="space-y-2"><label htmlFor="profile-website" className="text-sm font-medium">Website</label><input id="profile-website" name="website_url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://yourwebsite.com" type="url" autoComplete="url" className="input-base min-h-11 text-base sm:text-sm" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {([{ key: "twitter", label: "X / Twitter" }, { key: "instagram", label: "Instagram" }, { key: "tiktok", label: "TikTok" }] as const).map(({ key, label }) => (
                    <div key={key} className="space-y-2"><label htmlFor={`profile-${key}`} className="text-sm font-medium">{label}</label><input id={`profile-${key}`} name={`social_${key}`} value={socialLinks[key]} onChange={(event) => setSocialLinks((previous) => ({ ...previous, [key]: event.target.value }))} placeholder="@username" autoCapitalize="none" spellCheck={false} className="input-base min-h-11 text-base sm:text-sm" /></div>
                  ))}
                </div>
              </section>

              <section className="border-t border-border p-5 sm:p-7" aria-labelledby="profile-visibility-title">
                <div className="flex items-start justify-between gap-5">
                  <div><h2 id="profile-visibility-title" className="font-display text-xl font-medium">Profile visibility</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{isPublic ? "Readers can discover your author page and books in the library." : "Your profile is hidden from readers and discovery."}</p></div>
                  <label className="relative inline-flex min-h-11 w-12 shrink-0 cursor-pointer items-center">
                    <input type="checkbox" aria-label="Public profile" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="peer sr-only" />
                    <span className={`relative h-7 w-12 rounded-full border border-border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring ${isPublic ? "bg-primary" : "bg-muted"}`}><span className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full shadow-sm transition-transform ${isPublic ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} /></span>
                  </label>
                  <input type="hidden" name="is_public" value={isPublic ? "true" : "false"} />
                </div>
              </section>
            </div>

            <aside aria-label="Profile preview" className="order-1 min-w-0 @min-[860px]/profile:sticky @min-[860px]/profile:top-5 @min-[860px]/profile:order-2">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Reader preview</h2><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{isPublic ? <Eye size={14} /> : <EyeOff size={14} />}{isPublic ? "Public" : "Private"}</span></div>
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-surface-sm">
                <div className="relative h-40 overflow-hidden bg-accent/40">
                  {coverImageUrl ? <Image src={coverImageUrl} alt="Author cover photo" fill sizes="(min-width: 1200px) 340px, 100vw" className="object-cover" /> : <div className="flex h-full items-center justify-center border-b border-border"><p className="font-display text-lg text-muted-foreground">A space for your world.</p></div>}
                </div>
                <div className="relative px-6 pb-6">
                  <div className="relative -mt-10 mb-4 h-20 w-20 overflow-hidden rounded-2xl border-4 border-card bg-primary text-primary-foreground shadow-sm">{avatarUrl ? <Image src={avatarUrl} alt="Profile photo" fill sizes="80px" className="object-cover" /> : <div className="flex h-full items-center justify-center font-display text-2xl">{initials}</div>}</div>
                  <h3 className="break-words font-display text-2xl font-medium leading-tight">{displayName || "Your author name"}</h3>
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{bio || "Your introduction will appear here. Tell readers a little about you and the stories you write."}</p>
                  {websiteUrl && <p className="mt-5 flex items-start gap-2 break-all text-sm text-accent-foreground"><Globe size={15} className="mt-0.5 shrink-0" />{websiteUrl.replace(/^https?:\/\//, "")}</p>}
                  {Object.entries(socialLinks).some(([, value]) => value) && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">{Object.entries(socialLinks).filter(([, value]) => value).map(([key, value]) => <span key={key} className="break-all">{key === "twitter" ? "X" : key === "instagram" ? "Instagram" : "TikTok"}: @{value.replace(/^@/, "")}</span>)}</div>}
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Preview updates as you type. Save your profile to apply text and visibility changes.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" disabled={avatarUploading} onClick={() => avatarInputRef.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"><Camera size={15} />{avatarUploading ? "Uploading…" : "Change photo"}</button>
                <button type="button" disabled={coverUploading} onClick={() => coverInputRef.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"><Camera size={15} />{coverUploading ? "Uploading…" : coverImageUrl ? "Change cover" : "Add cover photo"}</button>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" aria-label="Upload profile photo" className="hidden" onChange={handleAvatarChange} />
              <input ref={coverInputRef} type="file" accept="image/*" aria-label="Upload cover photo" className="hidden" onChange={handleCoverChange} />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Photos save immediately. PNG, JPG or WebP. Profile photo: 2 MB; cover: 5 MB.</p>
              <div className="mt-2 text-sm" aria-live="polite">{avatarError && <p role="alert" className="text-red-600 dark:text-red-400">{avatarError}</p>}{coverError && <p role="alert" className="text-red-600 dark:text-red-400">{coverError}</p>}{imageMessage && <p className="text-emerald-700 dark:text-emerald-400">{imageMessage}</p>}</div>
            </aside>
          </fieldset>
          <div className="sticky bottom-20 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-surface-sm lg:bottom-4">
            <p role={state.message && !state.ok && !edited && !pending ? "alert" : "status"} aria-live="polite" className={`min-h-5 text-sm ${!edited && state.message && !pending ? state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{pending ? "Saving your profile…" : edited ? "Unsaved changes" : state.message || "Ready when you are."}</p>
            <button type="submit" disabled={pending || avatarUploading || coverUploading} className="ml-auto min-h-11 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      }
    />
  );
}
