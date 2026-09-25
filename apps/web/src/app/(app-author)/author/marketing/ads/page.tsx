import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { AdDraftPlanner } from "@/components/marketing/AdDraftPlanner";
export default async function Page() {
  const auth = await requireAuthorRole();
  if (!auth.ok) redirect("/author/signin");
  return <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-8"><Link href="/author/marketing" className="text-sm underline underline-offset-4">← Marketing</Link><AdDraftPlanner /></div>;
}
