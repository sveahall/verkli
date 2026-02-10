import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InboxClient from "@/components/messages/InboxClient";

export default async function ReaderInboxPage({
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
    redirect("/reader/signin");
  }

  return <InboxClient mode="reader" initialConversationId={initialConversationId} />;
}
