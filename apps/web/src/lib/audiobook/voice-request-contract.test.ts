import { describe, expect, it } from "vitest";
import { parseVoiceRequest, VOICE_DEMO_CONSENT, VOICE_DEMO_SAMPLE_HASH } from "./voice-request-contract";
const binding = { requestId: "request-one", provider: "synthetic", voiceId: "fake-one", consentVersion: VOICE_DEMO_CONSENT, sampleHash: VOICE_DEMO_SAMPLE_HASH };
const ready = { id: "request-one", ownerId: "demo-author-a", requestKey: "key-one", sampleId: "synthetic-valid", sampleHash: VOICE_DEMO_SAMPLE_HASH, consentVersion: VOICE_DEMO_CONSENT, consentRevoked: false, status: "ready", binding, error: null };
describe("voice request response contract", () => {
  it("requires a matching verified binding before ready", () => {
    expect(parseVoiceRequest(ready, ready.ownerId).status).toBe("ready");
    expect(() => parseVoiceRequest({ ...ready, binding: null }, ready.ownerId)).toThrow();
    expect(() => parseVoiceRequest({ ...ready, binding: { ...binding, requestId: "another-request" } }, ready.ownerId)).toThrow();
    expect(() => parseVoiceRequest({ ...ready, binding: { ...binding, sampleHash: "b".repeat(64) } }, ready.ownerId)).toThrow();
  });
  it("rejects responses from another owner or using revoked consent", () => {
    expect(() => parseVoiceRequest(ready, "demo-author-b")).toThrow("owner");
    expect(() => parseVoiceRequest({ ...ready, consentRevoked: true }, ready.ownerId)).toThrow();
  });
  it("requires the original binding and revocation for cleanup states", () => {
    for (const status of ["deleting", "deleted"]) {
      expect(() => parseVoiceRequest({ ...ready, status }, ready.ownerId)).toThrow();
      expect(() => parseVoiceRequest({ ...ready, status, consentRevoked: true, binding: null }, ready.ownerId)).toThrow();
      expect(parseVoiceRequest({ ...ready, status, consentRevoked: true }, ready.ownerId).status).toBe(status);
    }
  });
});
