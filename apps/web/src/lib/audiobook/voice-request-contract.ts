import { z } from "zod";
export const VOICE_DEMO_CONSENT = "synthetic-demo-v1";
export const VOICE_DEMO_SAMPLE_HASH = "a".repeat(64);
export const voiceOwnerSchema = z.enum(["demo-author-a", "demo-author-b"]);
export const voiceBindingSchema = z.object({ requestId: z.string().min(1), provider: z.literal("synthetic"), voiceId: z.string().min(1), consentVersion: z.literal(VOICE_DEMO_CONSENT), sampleHash: z.literal(VOICE_DEMO_SAMPLE_HASH) }).strict();
export const voiceRequestSchema = z.object({
  id: z.string().min(1), ownerId: voiceOwnerSchema, requestKey: z.string().min(1),
  sampleId: z.literal("synthetic-valid"), sampleHash: z.literal(VOICE_DEMO_SAMPLE_HASH), consentVersion: z.literal(VOICE_DEMO_CONSENT),
  consentRevoked: z.boolean(), status: z.enum(["pending", "requesting", "ready", "failed", "uncertain", "deleting", "deleted"]),
  binding: voiceBindingSchema.nullable(), error: z.string().nullable(),
}).strict().superRefine((row, ctx) => {
  if (row.binding && (row.binding.requestId !== row.id || row.binding.sampleHash !== row.sampleHash || row.binding.consentVersion !== row.consentVersion)) ctx.addIssue({ code: "custom", message: "Voice binding does not match the request." });
  if (["ready", "deleting", "deleted"].includes(row.status) && !row.binding) ctx.addIssue({ code: "custom", message: "Verified synthetic binding is required." });
  if (row.status === "ready" && row.consentRevoked) ctx.addIssue({ code: "custom", message: "Revoked consent cannot be ready." });
  if (["deleting", "deleted"].includes(row.status) && !row.consentRevoked) ctx.addIssue({ code: "custom", message: "Cleanup requires revoked consent." });
});
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;
export type VoiceStart = { ownerId: string; requestKey: string; sampleId: string; consent: boolean };
export interface VoiceSetupAdapter {
  load(ownerId: string): Promise<VoiceRequest | null>;
  start(input: VoiceStart): Promise<VoiceRequest>;
  revoke(ownerId: string, id: string): Promise<VoiceRequest>;
  reconcile(ownerId: string, id: string): Promise<VoiceRequest>;
  cleanup(ownerId: string, id: string): Promise<VoiceRequest>;
  subscribe(listener: () => void): () => void;
}
export function parseVoiceRequest(value: unknown, ownerId: string): VoiceRequest {
  const row = voiceRequestSchema.parse(value);
  if (row.ownerId !== ownerId) throw new Error("Voice response belongs to another owner.");
  return row;
}
