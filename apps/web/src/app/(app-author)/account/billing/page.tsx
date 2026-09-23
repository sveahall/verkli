import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AccountBillingRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.checkout) query.set("checkout", String(params.checkout));
  if (params.session_id) query.set("session_id", String(params.session_id));
  const qs = query.toString();
  redirect(qs ? `/author/billing?${qs}` : "/author/billing");
}
