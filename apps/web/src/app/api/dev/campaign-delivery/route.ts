import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { localDeliveryAction, LocalDeliveryError } from "@/lib/marketing/local-delivery-store";
import { DeliveryLedgerError } from "@/lib/marketing/delivery-ledger";

export const runtime = "nodejs";
const cookieName = "campaign-delivery-fixture";
const sessionSchema = z.string().uuid();
const commandSchema = z.object({
  action: z.enum(["approve", "edit", "schedule", "cancel", "retry", "consume", "new"]),
  expectedUpdatedAt: z.string().max(50).optional(), caption: z.string().max(280).optional(),
  hashtags: z.string().max(280).optional(), scheduledFor: z.string().max(50).optional(),
  outcome: z.enum(["success", "failure", "uncertain"]).optional(),
}).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function browserOrigin(request: NextRequest) {
  try {
    const host = request.headers.get("host") ?? request.nextUrl.host;
    const url = new URL(`${request.nextUrl.protocol}//${host}`);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.host === host ? url.origin : null;
  } catch { return null; }
}
function allowed(request: NextRequest) {
  return process.env.NODE_ENV === "development" && !!browserOrigin(request);
}
function failure(error: unknown) {
  if (error instanceof LocalDeliveryError || error instanceof DeliveryLedgerError) return json({ detail: error.message }, error.status);
  console.error("[campaign delivery] local journal operation failed");
  return json({ detail: "Could not save local delivery history. Reload before retrying; the previous receipt is retained." }, 500);
}
export async function GET(request: NextRequest) {
  if (!allowed(request)) return json({ detail: "Not found" }, 404);
  const saved = sessionSchema.safeParse(request.cookies.get(cookieName)?.value);
  const session = saved.success ? saved.data : randomUUID();
  try {
    const response = json(await localDeliveryAction(session));
    if (!saved.success) response.cookies.set(cookieName, session, { httpOnly: true, sameSite: "strict", path: "/api/dev/campaign-delivery", maxAge: 86400 });
    return response;
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  if (!allowed(request)) return json({ detail: "Not found" }, 404);
  if (request.headers.get("origin") !== browserOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return json({ detail: "Same-origin local request required." }, 403);
  const session = sessionSchema.safeParse(request.cookies.get(cookieName)?.value);
  if (!session.success) return json({ detail: "Load the local fixture before changing a post." }, 409);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ detail: "Local delivery request is too large." }, 413);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return json({ detail: "A valid JSON delivery command is required." }, 400); }
    const body = commandSchema.safeParse(value);
    if (!body.success) return json({ detail: "Invalid local delivery command." }, 422);
    return json(await localDeliveryAction(session.data, body.data));
  } catch (error) { return failure(error); }
}
