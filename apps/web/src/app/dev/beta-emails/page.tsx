import { notFound } from "next/navigation";
import {
  buildBetaInvitationHtml,
  buildBetaInvitationSubject,
  buildBetaInvitationText,
} from "@/lib/emails/beta-invitation";
import { buildWaitlistHtml, buildWaitlistSubject } from "@/lib/emails/waitlist-confirmation";
import BetaEmailsPreview, { type EmailPreview } from "./preview";

export default function BetaEmailsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const invitations: EmailPreview[] = (["author", "reader"] as const).flatMap((audience) =>
    [false, true].map((accountExists) => {
      const options = { email: `${audience}@example.com`, name: "Alex", audience, accountExists };
      return {
        id: `${audience}-${accountExists ? "existing" : "new"}`,
        label: `${audience === "author" ? "Author" : "Reader"} · ${accountExists ? "existing" : "new"} account`,
        recipient: options.email,
        subject: buildBetaInvitationSubject(),
        html: buildBetaInvitationHtml(options),
        text: buildBetaInvitationText(options),
      };
    }),
  );
  const confirmations: EmailPreview[] = (["author", "reader"] as const).map((variant) => {
    const options = { email: `${variant}@example.com`, name: "Alex", variant, position: 42 };
    return {
      id: `${variant}-waiting`,
      label: `${variant === "author" ? "Author" : "Reader"} · waiting`,
      recipient: options.email,
      subject: buildWaitlistSubject(options),
      html: buildWaitlistHtml(options),
      text: null,
    };
  });

  return <BetaEmailsPreview emails={[...invitations, ...confirmations]} />;
}
