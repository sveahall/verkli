"use client";

import { useState } from "react";
import { savePublishingDefaults } from "@/features/author/settings/actions";
import SettingsSectionForm from "./SettingsSectionForm";

export default function PublishingDefaultsSection({
  initialLanguage,
  initialVisibility,
  action = savePublishingDefaults,
}: {
  initialLanguage: string;
  initialVisibility: string;
  /** Overridden by the /dev fixture so a preview save never hits the account. */
  action?: typeof savePublishingDefaults;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [visibility, setVisibility] = useState(initialVisibility);

  return (
    <SettingsSectionForm
      title="Publishing defaults"
      description="Applied to new books. You can still change either one per book."
      action={action}
      idleMessage="These defaults apply to books you create from now on."
      saveLabel="Save defaults"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="author-settings-language" className="text-sm font-medium">Language</label>
          <select
            id="author-settings-language"
            name="default_language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="input-base min-h-11 text-base sm:text-sm"
          >
            <option value="sv">Swedish</option>
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="fr">French</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="author-settings-visibility" className="text-sm font-medium">Default visibility</label>
          <select
            id="author-settings-visibility"
            name="default_visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
            className="input-base min-h-11 text-base sm:text-sm"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
    </SettingsSectionForm>
  );
}
