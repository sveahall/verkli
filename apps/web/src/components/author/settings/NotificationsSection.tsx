"use client";

import { useState } from "react";
import { saveNotificationPreferences } from "@/features/author/settings/actions";
import SettingsSectionForm from "./SettingsSectionForm";

export default function NotificationsSection({ initialEmail, action = saveNotificationPreferences }: {
  initialEmail: boolean;
  /** Overridden by the /dev fixture so a preview save never hits the account. */
  action?: typeof saveNotificationPreferences;
}) {
  const [emailNotifications, setEmailNotifications] = useState(initialEmail);

  return (
    <SettingsSectionForm
      title="Notifications"
      description="Choose what Verkli may email you about."
      action={action}
      idleMessage="Account and security emails are always sent."
      saveLabel="Save notifications"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Activity on Verkli</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            New readers, reviews and sales on your books.
          </p>
        </div>
        <label className="relative inline-flex min-h-11 w-12 shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            aria-label="Email activity notifications"
            checked={emailNotifications}
            onChange={(event) => setEmailNotifications(event.target.checked)}
            className="peer sr-only"
          />
          <span className={`relative h-7 w-12 rounded-full border border-border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring ${emailNotifications ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full shadow-sm transition-transform ${emailNotifications ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} />
          </span>
        </label>
        <input type="hidden" name="email_notifications" value={emailNotifications ? "true" : "false"} />
      </div>
    </SettingsSectionForm>
  );
}
