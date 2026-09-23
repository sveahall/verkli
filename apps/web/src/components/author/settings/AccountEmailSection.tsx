"use client";

import { useState } from "react";
import type { ActionState } from "@/features/author/settings/actions";
import { resolveErrorMessage } from "@/lib/error-messages";
import SettingsSectionForm from "./SettingsSectionForm";

/**
 * Changing the sign-in email.
 *
 * Supabase owns the actual change: `/api/account/email` calls
 * `updateUser({ email })`, which mails both the current and the new address and
 * only moves the account once the new one is confirmed. So this form never
 * reports success as "changed" — the address on screen stays the old one until
 * the confirmation lands, and saying otherwise would have authors believing
 * they can already sign in with an address that does not work yet.
 */
async function requestEmailChange(_previous: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Enter the address you want to use." };

  let response: Response;
  try {
    response = await fetch("/api/account/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { ok: false, message: "Could not reach Verkli. Check your connection and try again." };
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; unchanged?: boolean; error?: string }
    | null;

  if (!response.ok) {
    return { ok: false, message: resolveErrorMessage(body?.error) };
  }
  if (body?.unchanged) {
    return { ok: true, message: "That is already your sign-in email." };
  }
  return {
    ok: true,
    message: `Confirm from both addresses. We emailed ${email} and your current address; the change takes effect once you confirm.`,
  };
}

export default function AccountEmailSection({
  currentEmail,
  action = requestEmailChange,
}: {
  currentEmail: string;
  /** Overridden by the /dev fixture so a preview never mails a real address. */
  action?: typeof requestEmailChange;
}) {
  const [email, setEmail] = useState(currentEmail);

  return (
    <SettingsSectionForm
      title="Account"
      description="The address you sign in with, and where Verkli sends account email."
      action={action}
      idleMessage="Changing this needs confirmation from both addresses."
      saveLabel="Change email"
    >
      <div className="space-y-2">
        <label htmlFor="author-settings-email" className="text-sm font-medium">Email</label>
        <input
          id="author-settings-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="settings-email-hint"
          className="input-base min-h-11 text-base sm:text-sm"
        />
        <p id="settings-email-hint" className="text-xs text-muted-foreground">
          You stay signed in with <span className="font-medium text-foreground">{currentEmail}</span> until you confirm the new address.
        </p>
      </div>
    </SettingsSectionForm>
  );
}
