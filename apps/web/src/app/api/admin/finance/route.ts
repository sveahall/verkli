import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { getStripeBalanceReport } from "@/lib/payments/stripe-balance-report";
import { monthBounds } from "@/lib/payments/monthly-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    const { response } = await requireAdminRoleForApi();
    if (response) return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...headers } });
    const query = new URL(request.url).searchParams;
    const month = query.get("month") ?? "";
    try {
      const { from } = monthBounds(month);
      if ([...query.keys()].some(key => key !== "month") || query.getAll("month").length !== 1 || Date.parse(from) > Date.now()) throw new Error("Invalid period or scope");
    } catch {
      return Response.json({ error: "Choose a current or past month (YYYY-MM). Account and mode are configured by the server." }, { status: 400, headers });
    }
    return Response.json(await getStripeBalanceReport(month), { headers });
  } catch {
    // Provider exceptions may contain customer information. Never serialize or log the raw error.
    console.error("[admin finance] provider activity read failed");
    return Response.json({ error: "Stripe account activity could not be loaded. No totals are available. Please retry." }, { status: 502, headers });
  }
}
