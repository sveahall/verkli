import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { ChannelConnections } from "@/components/marketing/ChannelConnections";
export default async function Page() {
  const auth = await requireAuthorRole();
  if (!auth.ok) redirect("/author/signin");
  return <div className="space-y-5"><Link href="/author/marketing" className="text-sm text-muted-foreground">← Marketing</Link><ChannelConnections /></div>;
}
