import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  changeDelivery, consumeDelivery, createSimulationTransport, isDeliveryInsertConflict, scheduleDelivery,
  type DeliveryRecord, type DeliveryRepository,
} from "./delivery-ledger";
import type { LocalDeliveryView, LocalPost } from "./local-delivery-types";

export class LocalDeliveryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
type Document = { post: LocalPost; approval?: { revision: string; text: string }; deliveries: DeliveryRecord[] };
const sessionPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function freshPost(): LocalPost {
  return { id: randomUUID(), scheduledFor: new Date().toISOString(), channel: "x", language: "en", contentType: "text", status: "draft",
    headline: null, caption: "A story worth staying up for.", hashtags: "#NewBook", cta: null, shareUrl: null,
    mediaAssetId: null, mediaAssetUrl: null, assetError: null, postedAt: null, postedUrl: null,
    mode: "organic", updatedAt: new Date().toISOString(), metadata: {} };
}
function touch(document: Document) {
  document.post.updatedAt = new Date(Math.max(Date.now(), Date.parse(document.post.updatedAt) + 1)).toISOString();
}
function view(document: Document): LocalDeliveryView {
  const delivery = document.deliveries.findLast(record => record.postId === document.post.id);
  return { post: { ...document.post, metadata: delivery ? { delivery: {
    jobId: delivery.id, state: delivery.state, approvedRevision: delivery.approvedRevision, text: delivery.text,
    scheduledFor: delivery.scheduledFor, simulated: true,
    dispatched: delivery.state === "processing" || delivery.state === "uncertain", error: delivery.error,
  } } : {} }, deliveries: document.deliveries.filter(record => record.postId === document.post.id) };
}

/** Local durable adapter only. No DB, queue, account credentials or real transport.
 * Each server-generated session owns a separate file. Exclusive create serializes
 * processes; never steal a stale lock after a crash (fail closed until inspected).
 */
export async function localDeliveryAction(session: string, body: Record<string, unknown> = {}, directory = path.join(process.cwd(), ".next", "campaign-delivery-ledger")): Promise<LocalDeliveryView> {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "") || !sessionPattern.test(session)) {
    throw new LocalDeliveryError("Local campaign ledger is unavailable.", 404);
  }
  const userId = createHash("sha256").update(session).digest("hex");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${session}.json`);
  const lockPath = `${file}.lock`;
  let lock;
  for (let attempt = 0; !lock && attempt < 5; attempt++) {
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (attempt < 4) await delay(10 * 2 ** attempt);
    }
  }
  if (!lock) throw new LocalDeliveryError("Another delivery update is running. Reload and try again.");
  try {
    let document: Document;
    try { document = JSON.parse(await readFile(file, "utf8")) as Document; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new LocalDeliveryError("Could not read local delivery history. Existing data has been preserved.", 500);
      document = { post: freshPost(), deliveries: [] };
    }
    const persist = async () => {
      const temporary = `${file}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(document)); await handle.sync(); }
      finally { await handle.close(); }
      try { await rename(temporary, file); }
      catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    };
    const repository: DeliveryRepository = {
      get: async (id, userId) => structuredClone(document.deliveries.find(item => item.id === id && item.userId === userId) ?? null),
      insert: async record => {
        if (document.deliveries.some(item => item.id === record.id || isDeliveryInsertConflict(item, record))) return false;
        document.deliveries.push(structuredClone(record)); touch(document); await persist(); return true;
      },
      compareAndSwap: async (previous, next) => {
        const index = document.deliveries.findIndex(item => item.id === previous.id && item.userId === previous.userId && item.version === previous.version);
        if (index < 0) return false;
        document.deliveries[index] = structuredClone(next); touch(document); await persist(); return true;
      },
    };
    const action = body.action;
    const current = document.deliveries.findLast(item => item.postId === document.post.id);
    if (action && action !== "consume" && body.expectedUpdatedAt !== document.post.updatedAt) {
      throw new LocalDeliveryError("This post changed. Reload and review the current version.");
    }
    if (action === "edit" || action === "approve") {
      if (current && ["scheduled", "processing", "uncertain", "simulated", "published", "failed"].includes(current.state)) throw new LocalDeliveryError("Cancel the pending delivery before editing. Completed or uncertain deliveries cannot be edited.");
      if (typeof body.caption !== "string" || !body.caption.trim() || body.caption.length > 280 || typeof body.hashtags !== "string" || body.hashtags.length > 280) throw new LocalDeliveryError("Add a caption and keep this X text within 280 characters.", 422);
      document.post.caption = body.caption; document.post.hashtags = body.hashtags;
      document.post.status = action === "approve" ? "ready" : "draft";
      touch(document);
      document.approval = action === "approve" ? { revision: document.post.updatedAt, text: [body.caption, body.hashtags].filter(Boolean).join("\n\n") } : undefined;
    } else if (action === "schedule") {
      if (document.post.status !== "ready" || !document.approval) throw new LocalDeliveryError("Approve the final copy before scheduling.");
      await scheduleDelivery({ repository, userId, postId: document.post.id, approvedRevision: document.approval.revision,
        text: document.approval.text, channel: "x", scheduledFor: String(body.scheduledFor ?? ""), mode: "simulation" });
    } else if (action === "cancel" || action === "retry") {
      if (!current) throw new LocalDeliveryError("No scheduled delivery was found.");
      await changeDelivery({ repository, id: current.id, userId, expectedVersion: current.version, action });
    } else if (action === "consume") {
      if (current) {
        if (!["success", "failure", "uncertain"].includes(String(body.outcome))) throw new LocalDeliveryError("Choose a valid test transport outcome.", 422);
        await consumeDelivery({ repository, id: current.id, userId, transport: createSimulationTransport(body.outcome as "success" | "failure" | "uncertain") });
      }
    } else if (action === "new") {
      if (current && ["scheduled", "processing", "uncertain", "failed"].includes(current.state)) throw new LocalDeliveryError("Resolve or cancel this delivery before starting a new post.");
      document.post = freshPost(); document.approval = undefined;
    } else if (action !== undefined) {
      throw new LocalDeliveryError("Unsupported local delivery action.", 422);
    }
    await persist();
    return view(document);
  } finally { await lock.close(); await unlink(lockPath); }
}
