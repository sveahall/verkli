import { NextResponse } from "next/server";
import { z } from "zod";
import { hashOfflineText, OFFLINE_FIXTURE_AUDIENCE } from "@/lib/offline/lease";
import { issueOfflineLease } from "@/lib/offline/lease-server";

// Never uses auth, Supabase, production signing keys or real manuscripts.
// Key creation is lazy and occurs only AFTER the development gate.
const fixtureRuntime = globalThis as typeof globalThis & {
  __verkliOfflineFixture?: { keys: Promise<CryptoKeyPair>; revoked: Set<string> };
};
function fixtureState() {
  return fixtureRuntime.__verkliOfflineFixture ??= {
    keys: crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]),
    revoked: new Set<string>(),
  };
}
const bodySchema = z.object({
  owner: z.enum(["fixture-reader-a", "fixture-reader-b"]),
  action: z.enum(["download", "check", "revoke", "restore"]),
  shortLease: z.boolean().optional(),
}).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  if (process.env.NODE_ENV !== "development") return json({ error: "Not found" }, 404);
  try {
    return json({ fixture: true, publicKey: await crypto.subtle.exportKey("jwk", (await fixtureState().keys).publicKey) });
  } catch (error) {
    console.error("[offline fixture] Could not load verification key", error);
    return json({ error: "Could not load fixture verification key. Retry while connected." }, 500);
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return json({ error: "Not found" }, 404);
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Only fixed synthetic fixture accounts and actions are accepted." }, 400);
    const { owner, action, shortLease } = parsed.data;
    const { revoked } = fixtureState();
    if (action === "revoke") revoked.add(owner);
    if (action === "restore") revoked.delete(owner);
    if (revoked.has(owner)) return json({ error: "Fixture access revoked. Saved text must be cleared." }, 403);
    if (action !== "download") return json({ fixture: true, allowed: true });
    const chapters = [{ id: "fixture-chapter", text: `Synthetic story for ${owner}.\n\nThe little boat left the harbour at sunrise. This text is invented solely for local offline testing. It is not a real book or a customer's manuscript.` }];
    const now = Date.now();
    const lease = await issueOfflineLease((await fixtureState().keys).privateKey, {
      userId: owner, bookId: "fixture-book", editionId: "fixture-en-v1",
      chapters: [{ id: chapters[0].id, hash: await hashOfflineText(chapters[0].text) }],
    }, now, now + (shortLease ? 15_000 : 24 * 60 * 60 * 1000), OFFLINE_FIXTURE_AUDIENCE);
    return json({ fixture: true, lease, chapters });
  } catch (error) {
    console.error("[offline fixture] Could not complete fixture request", error);
    return json({ error: "Could not complete fixture request. Nothing was marked as saved." }, 500);
  }
}
