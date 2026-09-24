import { unsubscribePage } from "@/lib/newsletters/unsubscribe-page";

const action = "/dev/newsletter-unsubscribe";
const token = "synthetic-preview";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  return unsubscribePage(params.get("state") === "invalid" ? "invalid" : "confirm", {
    token,
    action: params.get("fail") === "1" ? `${action}?fail=1` : action,
    testMode: true,
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const body = await request.formData().catch(() => null);
  if (body?.get("token") !== token || body.get("confirm") !== "unsubscribe") {
    return unsubscribePage("invalid", { testMode: true });
  }
  return unsubscribePage(new URL(request.url).searchParams.get("fail") === "1" ? "failed" : "success", {
    token,
    action,
    testMode: true,
  });
}
