import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";
import { validateForPlatform } from "@/lib/social/platform-constraints";
import { getPostDelivery, isPostDeliveryLocked, type PostDelivery } from "./post-delivery-state";

type Client = ReturnType<typeof createAdminClient>;
type Post = Tables<"marketing_posts">;
export type PostDeliveryJob = { postId: string; jobId: string; userId: string; scheduledFor: string };
export class DeliveryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function assertLocalCampaignSimulation(simulated: boolean): void {
  if (!simulated || !["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    throw new DeliveryError("Campaign delivery is available only as a local development simulation. Live publishing requires a protected server delivery ledger.", 503);
  }
  if (process.env.NODE_ENV !== "test") {
    const urls = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
    const local = urls.length > 0 && urls.every(value => {
      try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value!).hostname); }
      catch { return false; }
    });
    if (!local) throw new DeliveryError("Local development simulation requires a loopback Supabase URL. Remote databases are not allowed.", 503);
  }
}
async function readPost(client: Client, postId: string, userId: string): Promise<Post> {
  const { data, error } = await client.from("marketing_posts").select("*").eq("id", postId).eq("author_id", userId).maybeSingle();
  if (error) throw new DeliveryError("Could not read campaign delivery. Try again.", 500);
  if (!data) throw new DeliveryError("Campaign post not found.", 404);
  const { data: book, error: ownerError } = await client.from("books").select("id").eq("id", data.book_id).eq("author_id", userId).maybeSingle();
  if (ownerError) throw new DeliveryError("Could not verify the campaign owner.", 500);
  if (!book) throw new DeliveryError("Campaign post not found.", 404);
  return data;
}
async function save(client: Client, post: Post, delivery: PostDelivery): Promise<Post> {
  const { data, error } = await client.from("marketing_posts").update({
    metadata: { ...(post.metadata as Record<string, Json>), delivery: delivery as unknown as Json },
  }).eq("id", post.id).eq("author_id", post.author_id).eq("updated_at", post.updated_at)
    .eq("status", post.status).select("*").maybeSingle();
  if (error) throw new DeliveryError("Could not save delivery status. Refresh before trying again.", 500);
  if (!data) throw new DeliveryError("This post changed. Refresh and review the latest version.");
  return data;
}

/** Local simulation only. Metadata is client-writable under existing RLS;
 * it MUST NOT become a live dispatch authority without a protected ledger. */
export async function changePostDelivery(input: {
  client: Client; postId: string; userId: string; expectedUpdatedAt: string;
  action: "schedule" | "cancel" | "retry"; scheduledFor?: string; simulated: boolean;
  enqueue: (job: PostDeliveryJob) => Promise<string | null>;
}): Promise<Post> {
  assertLocalCampaignSimulation(input.simulated);
  const { client, postId, userId, action, simulated } = input;
  let post = await readPost(client, postId, userId);
  if (post.updated_at !== input.expectedUpdatedAt) throw new DeliveryError("This post changed. Reload and review the current version.");
  const previous = getPostDelivery(post.metadata);
  if (action === "cancel") {
    if (!previous || !["scheduled", "failed"].includes(previous.state)) throw new DeliveryError("Cannot cancel a delivery already in progress or uncertain. Verify your connected account.");
    return save(client, post, { ...previous, state: "cancelled" });
  }
  if (post.status !== "ready") throw new DeliveryError("Approve the final copy before scheduling.");
  if (post.channel !== "x" || post.content_type !== "text") throw new DeliveryError("This channel or format requires manual sharing.", 422);
  if (isPostDeliveryLocked(post.metadata)) throw new DeliveryError("A delivery is scheduled, in progress or uncertain. Cancel or verify it before scheduling again.");
  let delivery: PostDelivery;
  if (action === "retry") {
    if (!previous || previous.state !== "failed" || previous.dispatched) throw new DeliveryError("This delivery cannot be retried. Verify any uncertain result in your account.");
    if (previous.simulated !== simulated) throw new DeliveryError("A simulation cannot be resumed as a live delivery.");
    delivery = { ...previous, state: "scheduled", error: undefined };
  } else {
    const text = [post.caption, post.hashtags, post.cta, post.share_url].filter(v => v?.trim()).join("\n\n");
    const validation = validateForPlatform(text, "x");
    if (!text.trim() || !validation.valid) throw new DeliveryError(validation.error ?? "Add the final caption before scheduling.", 422);
    const time = Date.parse(input.scheduledFor ?? "");
    if (!Number.isFinite(time) || time < Date.now() - 5_000) throw new DeliveryError("Choose a publishing time now or in the future.", 422);
    delivery = { jobId: randomUUID(), state: "scheduled", approvedRevision: post.updated_at, text, scheduledFor: new Date(time).toISOString(), simulated };
  }
  post = await save(client, post, delivery);
  try {
    if (!await input.enqueue({ postId, userId, jobId: delivery.jobId, scheduledFor: delivery.scheduledFor })) throw new Error("Queue unavailable");
  } catch (error) {
    // Enqueue can have succeeded before its acknowledgement was lost. CAS against
    // this revision prevents overwriting a consumer that has already claimed it.
    console.error("[campaign delivery] enqueue failed:", error instanceof Error ? error.message : "Unknown queue error");
    await save(client, post, { ...delivery, state: "failed", error: "Publishing queue unavailable. Retry to schedule the approved copy." });
    throw new DeliveryError("Publishing queue unavailable. Refresh and retry the approved copy.", 503);
  }
  return post;
}

export async function consumePostDelivery(input: {
  client: Client; postId: string; userId: string; jobId: string; simulated: boolean;
  now?: number;
}): Promise<void> {
  assertLocalCampaignSimulation(input.simulated);
  const { client, userId, postId, jobId } = input;
  let post: Post;
  try { post = await readPost(client, postId, userId); }
  catch (error) { if (error instanceof DeliveryError && error.status === 404) return; throw error; }
  const saved = getPostDelivery(post.metadata);
  if (!saved || saved.jobId !== jobId || saved.state !== "scheduled" || post.status !== "ready") return;
  if (saved.simulated !== input.simulated) throw new DeliveryError("A simulation cannot be resumed as a live delivery.");
  if (Date.parse(saved.scheduledFor) > (input.now ?? Date.now())) return;
  if (post.channel !== "x" || post.content_type !== "text") throw new DeliveryError("Unsupported campaign delivery format.");
  const currentText = [post.caption, post.hashtags, post.cta, post.share_url].filter(v => v?.trim()).join("\n\n");
  if (currentText !== saved.text) {
    await save(client, post, { ...saved, state: "cancelled", error: "The approved copy changed. Review and approve the current version before scheduling again." });
    return;
  }
  const delivery: PostDelivery = { ...saved, state: "processing" };
  try { post = await save(client, post, delivery); }
  catch (error) { if (error instanceof DeliveryError && error.status === 409) return; throw error; }
  // Deliberately no publisher callback or transport. Even forged metadata in a
  // local test can produce only this simulated receipt, never an external post.
  await save(client, post, { ...delivery, state: "simulated" });
}
