export type PostDelivery = {
  jobId: string;
  state: "scheduled" | "processing" | "failed" | "uncertain" | "simulated" | "published" | "cancelled";
  approvedRevision: string;
  text: string;
  scheduledFor: string;
  simulated: boolean;
  dispatched?: boolean;
  error?: string;
  postId?: string;
};

export function getPostDelivery(metadata: unknown): PostDelivery | undefined {
  if (!metadata || typeof metadata !== "object" || !("delivery" in metadata)) return undefined;
  return metadata.delivery as PostDelivery | undefined;
}

export function isPostDeliveryLocked(metadata: unknown): boolean {
  const state = getPostDelivery(metadata)?.state;
  return !!state && ["scheduled", "processing", "uncertain", "published"].includes(state);
}
