"use client";

import { useEffect, useRef, useState } from "react";
import ProfilePage from "@/components/author/profile/ProfilePage";
import AccountEmailSection from "@/components/author/settings/AccountEmailSection";
import SecuritySection from "@/components/author/settings/SecuritySection";
import PublishingDefaultsSection from "@/components/author/settings/PublishingDefaultsSection";
import NotificationsSection from "@/components/author/settings/NotificationsSection";
import SettingsNav from "@/components/author/settings/SettingsNav";
import AiSettingsSection from "@/features/ai-team/settings/AiSettingsSection";
import SubscriptionPlanSection from "@/components/author/settings/SubscriptionPlanSection";
import shellStyles from "@/features/author-shell/AuthorAppShell.module.css";
import type { ActionState } from "@/features/author/settings/actions";
import { DEFAULT_AI_SETTINGS } from "@/features/ai-team/settings/contracts";

const sampleProfile = {
  displayName: "Alex Lind",
  bio: "I write about the places we leave behind, and the people who bring us home. Coastal mysteries, quiet courage, and a little Nordic weather.",
  isPublic: true,
  websiteUrl: "https://example.com",
  socialLinks: { twitter: "", instagram: "alexlind.example", tiktok: "" },
};
const emptyProfile = { displayName: "", bio: "", isPublic: false, websiteUrl: "", socialLinks: { twitter: "", instagram: "", tiktok: "" } };

/** Actual account components; every save, upload and sign-out is local to this fixture. */
export default function AccountStudioPreview() {
  const [view, setView] = useState<"profile" | "settings">("profile");
  const [fail, setFail] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [lastAction, setLastAction] = useState("No local action yet.");
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const delay = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350));

  async function upload(file: File) {
    await delay();
    if (fail) return { path: null, url: null, error: { message: "Simulated upload failure." } };
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    setLastAction(`Local image preview: ${file.name}`);
    return { path: `preview/${file.name}`, url, error: null };
  }
  async function saveImage(): Promise<ActionState> {
    return { ok: !fail, message: fail ? "Simulated image save failure." : "Image saved in this preview." };
  }

  return (
    <div className={`${shellStyles.shell} min-h-screen bg-background text-foreground`}>
      <div className="border-b border-border bg-accent/30 px-4 py-3 sm:px-8">
        <p className="text-sm font-medium">Account studio · local UI preview</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Synthetic profile and prices. All writes and uploads stay in this page. No account, password, subscription or session is changed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <nav aria-label="Preview pages" className="flex gap-2">
            {(["profile", "settings"] as const).map((page) => <button key={page} type="button" aria-pressed={view === page} onClick={() => setView(page)} className={`min-h-11 rounded-full border border-border px-4 text-sm capitalize ${view === page ? "bg-primary text-primary-foreground" : "bg-card"}`}>{page}</button>)}
          </nav>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />Simulate save failure</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={empty} onChange={(event) => setEmpty(event.target.checked)} />Empty profile</label>
        </div>
        <output aria-label="Last local action" className="mt-2 block text-xs text-muted-foreground">{lastAction}</output>
      </div>
      {view === "profile" ? (
        <ProfilePage key={empty ? "empty" : "sample"} user={{ id: "synthetic-account-preview" }} profile={empty ? emptyProfile : sampleProfile} headerActions={null} actions={{
          uploadAvatar: upload,
          uploadProfileCover: upload,
          updateAvatarPath: saveImage,
          updateCoverImagePath: saveImage,
          saveAuthorProfile: async (_previous, data) => {
            await delay();
            if (fail) return { ok: false, message: "Simulated save failure. Your changes are still here." };
            if (!String(data.get("display_name") || "").trim()) return { ok: false, message: "Display name is required." };
            setLastAction(`Local profile save: ${data.get("display_name")} · public: ${data.get("is_public")} · website: ${data.get("website_url") || "none"}`);
            return { ok: true, message: "Profile saved in this preview." };
          },
        }} />
      ) : (
        // Settings is a set of routes in the app; the fixture stacks every
        // section so one screen still shows the whole surface. Each section
        // takes a local action, so nothing here writes to an account.
        <div className="@container/settings space-y-6">
          <SettingsNav />
          <AccountEmailSection
            currentEmail="alex@example.test"
            action={async (_previous: ActionState, data: FormData) => {
              await delay();
              if (fail) return { ok: false, message: "Simulated failure. Your address is unchanged." };
              setLastAction(`Local email change preview: ${data.get("email")}. No mail was sent.`);
              return { ok: true, message: "Confirmation emails would be sent in production." };
            }}
          />
          <SecuritySection
            action={async (_previous: ActionState, data: FormData) => {
              await delay();
              if (fail) return { ok: false, message: "Simulated save failure. Your changes are still here." };
              const password = String(data.get("new_password") || "");
              const confirmation = String(data.get("confirm_password") || "");
              if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
              if (password !== confirmation) return { ok: false, message: "Passwords do not match." };
              setLastAction("Local password change preview. Your real password is unchanged.");
              return { ok: true, message: "Password updated in this preview." };
            }}
            onSignOut={() => setLastAction("Local sign-out preview. All real sessions remain active.")}
          />
          <PublishingDefaultsSection
            initialLanguage="en"
            initialVisibility="private"
            action={async (_previous: ActionState, data: FormData) => {
              await delay();
              if (fail) return { ok: false, message: "Simulated save failure. Your changes are still here." };
              setLastAction(`Local defaults save: ${data.get("default_language")} · ${data.get("default_visibility")}`);
              return { ok: true, message: "Publishing defaults saved in this preview." };
            }}
          />
          <NotificationsSection
            initialEmail
            action={async (_previous: ActionState, data: FormData) => {
              await delay();
              if (fail) return { ok: false, message: "Simulated save failure. Your changes are still here." };
              setLastAction(`Local notifications save: email ${data.get("email_notifications")}`);
              return { ok: true, message: "Notification preferences saved in this preview." };
            }}
          />
          <AiSettingsSection
            settings={{ ...DEFAULT_AI_SETTINGS, nickname: "Alex", craft: "Historical fiction" }}
            action={async (_previous: ActionState, data: FormData) => {
              await delay();
              if (fail) return { ok: false, message: "Simulated save failure. Your changes are still here." };
              setLastAction(`Local AI save: ${data.get("ai_enabled") === "true" ? "on" : "off"} · ${data.get("ai_reply_style")} · emoji ${data.get("ai_emoji")}`);
              return { ok: true, message: "AI settings saved in this preview." };
            }}
          />
          <SubscriptionPlanSection initialEnabled initialPriceMonthly={4900} initialCurrency="sek" initialDescription="All my books and early chapters." savePlan={async (plan) => {
            await delay();
            if (fail) return Response.json({ error: "Simulated subscription save failure." }, { status: 500 });
            setLastAction(`Local subscription save: ${JSON.stringify(plan)}`);
            return Response.json({ ok: true });
          }} />
        </div>
      )}
    </div>
  );
}
