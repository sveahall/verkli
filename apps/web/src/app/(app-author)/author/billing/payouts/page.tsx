import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { getConnectedPayoutSnapshot, type PayoutSnapshot } from "@/lib/payments/stripe-payouts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayoutAccount, type ConnectAccount } from "@/lib/payments/stripe-connect";
import PayoutsView from "@/components/author/PayoutsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AuthorPayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const auth = await requireAuthorRole();
  if (!auth.ok) redirect(auth.status === 401 ? "/author/signin" : "/reader/home");

  let account: ConnectAccount | null = null;
  let snapshot: PayoutSnapshot | null = null;
  let loadFailed = false;
  try {
    account = await getPayoutAccount(createAdminClient(), auth.user.id);
    if (account?.payouts_enabled) snapshot = await getConnectedPayoutSnapshot(account.stripe_account_id);
  } catch (error) {
    loadFailed = true;
    console.error("[author payouts] load failed", {
      userId: auth.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const locale = await getLocale();

  const resolvedParams = (await (searchParams ?? Promise.resolve({} as SearchParams))) as SearchParams;
  const statusParam = resolvedParams?.status;
  const statusKey = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  const t = (await getTranslations("author.billing.payouts"));

  return <PayoutsView account={account} snapshot={snapshot} loadFailed={loadFailed} locale={locale} t={t} statusKey={statusKey} />;
}
