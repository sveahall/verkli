import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InboxClient from "@/components/messages/InboxClient";

export default async function AuthorInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialConversationId =
    typeof resolvedSearchParams?.conversation === "string"
      ? resolvedSearchParams.conversation
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  return (
    <div className="page-content pb-10 pt-8 sm:pt-10">
      <InboxClient mode="author" initialConversationId={initialConversationId} />
    </div>
  );
}
