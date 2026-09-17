"use client";

import { useState, type ComponentProps } from "react";
import { PostDrawer } from "@/features/author-workspaces/marketing/CampaignDetailView";
import { getPostDelivery, type PostDelivery } from "@/lib/marketing/post-delivery-state";
import { Button } from "@/components/ui/button";

type Post = ComponentProps<typeof PostDrawer>["post"];
const initial: Post = {
  id: "11111111-1111-4111-8111-111111111111", scheduledFor: "2026-09-17T15:00:00Z", channel: "x", language: "en",
  contentType: "text", status: "draft", headline: null, caption: "A story worth staying up for.", hashtags: "#NewBook",
  cta: null, shareUrl: null, mediaAssetId: null, mediaAssetUrl: null, assetError: null,
  postedAt: null, postedUrl: null, mode: "organic", updatedAt: "2026-09-17T14:00:00Z", metadata: {},
};

/** UI fixture only: callbacks below are in-memory and never call an API or queue. */
export default function CampaignDeliveryPreview() {
  const [post, setPost] = useState(initial);
  const [open, setOpen] = useState(false);
  const [failQueue, setFailQueue] = useState(false);
  const [runs, setRuns] = useState(0);
  const commit = (patch: Partial<Post>) => {
    const next = { ...post, ...patch, updatedAt: new Date().toISOString() };
    setPost(next); return next;
  };
  const writeDelivery = (delivery: PostDelivery) => commit({ metadata: { delivery } });
  const consume = () => {
    const current = getPostDelivery(post.metadata);
    if (current?.state !== "scheduled") return;
    writeDelivery({ ...current, state: "simulated" });
    setRuns(value => value + 1);
  };
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Campaign delivery · local UI fixture</h1>
    <p>This page uses the real review drawer with in-memory callbacks. It sends no requests, social posts or emails. The API/queue/consumer chain is covered separately by the local flow tests.</p>
    <p>1. Open the post, approve it and schedule a simulation. 2. Close the drawer. 3. Consume the queued simulation and reopen to inspect the result.</p>
    <label className="flex items-center gap-2"><input type="checkbox" checked={failQueue} onChange={event => setFailQueue(event.target.checked)} />Simulate queue failure</label>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setOpen(true)}>Review local post</Button>
      <Button variant="ghost" onClick={consume}>Consume queued simulation</Button>
      <Button variant="ghost" onClick={() => { setPost({ ...initial, updatedAt: new Date().toISOString() }); setRuns(0); }}>Reset fixture</Button>
    </div>
    <p role="status">Post: {post.status} · Delivery: {getPostDelivery(post.metadata)?.state ?? "not scheduled"} · Simulated outcomes: {runs} · External posts: 0</p>
    {open ? <PostDrawer post={post} onClose={() => setOpen(false)} onReload={async () => post} onGenerateTrailer={async () => {}}
      onUpdate={async (_id, body) => {
        if (body.expectedUpdatedAt !== post.updatedAt) throw new Error("The fixture post changed. Reload it.");
        const edited = body.caption !== undefined && body.caption !== post.caption || body.hashtags !== undefined && body.hashtags !== post.hashtags;
        return commit({ caption: (body.caption ?? post.caption) as string, hashtags: (body.hashtags ?? post.hashtags) as string, status: body.status as string ?? (edited ? "draft" : post.status), metadata: edited ? {} : post.metadata });
      }}
      onDelivery={async (_id, body) => {
        const previous = getPostDelivery(post.metadata);
        if (body.action === "cancel" && previous) return writeDelivery({ ...previous, state: "cancelled" });
        const delivery: PostDelivery = body.action === "retry" && previous ? { ...previous, state: "scheduled", error: undefined } : {
          jobId: "local-ui-fixture", state: "scheduled", approvedRevision: post.updatedAt, text: [post.caption, post.hashtags].join("\n\n"), scheduledFor: String(body.scheduledFor), simulated: true,
        };
        if (failQueue) {
          writeDelivery({ ...delivery, state: "failed", error: "Simulated queue failure. Close this drawer, turn off the failure control, reopen and retry." });
          throw new Error("Simulated queue failure. The approved copy is retained.");
        }
        return writeDelivery(delivery);
      }} /> : null}
  </main>;
}
