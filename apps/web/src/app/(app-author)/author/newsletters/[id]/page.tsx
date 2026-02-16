import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getNewslettersEnabled } from "@/lib/flags";
import { requireAuthorRole } from "@/lib/auth/require-author";
import NewsletterComposer from "@/components/newsletters/NewsletterComposer";

type NewsletterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NewsletterDetailPage({
  params,
}: NewsletterDetailPageProps) {
  if (!getNewslettersEnabled()) {
    redirect("/author/home");
  }

  const authResult = await requireAuthorRole();
  if (!authResult.ok) {
    redirect("/reader/signin");
  }
  const user = authResult.user;

  const { id } = await params;
  const supabase = await createClient();

  const { data: newsletter } = await supabase
    .from("newsletters" as never)
    .select("id, author_id, subject, body_html, body_text, status, sent_at, recipient_count, created_at")
    .eq("id", id)
    .eq("author_id", user.id)
    .single();

  if (!newsletter) {
    notFound();
  }

  const typed = newsletter as {
    id: string;
    author_id: string;
    subject: string;
    body_html: string;
    body_text: string;
    status: string;
    sent_at: string | null;
    recipient_count: number;
    created_at: string;
  };

  return (
    <div className="section-gap">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/author/newsletters"
          className="text-[13px] text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
        >
          ← Back to newsletters
        </Link>
      </div>

      <h1 className="text-page-title mb-6">
        {typed.status === "draft" ? "Edit newsletter" : "Newsletter"}
      </h1>

      {typed.status === "sent" && (
        <div className="mb-6 flex items-center gap-3 text-[13px] text-slate-500 dark:text-white/50">
          <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
            Sent
          </span>
          <span>
            Sent to {typed.recipient_count} recipients on{" "}
            {typed.sent_at
              ? new Date(typed.sent_at).toLocaleDateString("en-US")
              : "—"}
          </span>
        </div>
      )}

      <NewsletterComposer
        newsletter={{
          id: typed.id,
          subject: typed.subject,
          body_html: typed.body_html,
          body_text: typed.body_text,
          status: typed.status,
        }}
      />
    </div>
  );
}
