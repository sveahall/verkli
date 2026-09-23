import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { AdDraftPlanner } from "@/components/marketing/AdDraftPlanner";
export default async function Page() {
  const auth = await requireAuthorRole();
  if (!auth.ok) redirect("/author/signin");
  return <div className="space-y-5"><Link href="/author/marketing" className="text-sm underline underline-offset-4">← Marketing</Link><AdDraftPlanner /></div>;
}
