import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  deleteVoice: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/tts/elevenlabs-voice-cloning", () => ({ deleteVoice: mocks.deleteVoice }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit, auditMetadataFromRequest: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      update: mocks.update,
    }),
  }),
}));

import { DELETE } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const request = () => new Request(`https://example.invalid/api/author/voices/${id}`, { method: "DELETE" });
const context = { params: Promise.resolve({ id }) };

describe("voice deletion provider ownership boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId }, role: "author" });
    mocks.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.deleteVoice.mockResolvedValue(undefined);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it.each(["cloned", "preset", "professional"])(
    "does not delete an external voice based on a mutable %s row",
    async (source) => {
      mocks.maybeSingle.mockResolvedValue({ data: {
        id, user_id: userId, source, name: "Synthetic voice", status: "ready", deleted_at: null,
        elevenlabs_voice_id: "synthetic-someone-elses-provider-voice",
        voice_consents: [{ accepted_at: "2026-09-01T00:00:00Z", withdrawn_at: null }],
      }, error: null });
      const response = await DELETE(request(), context);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "VOICE_DELETION_REQUIRES_VERIFICATION" });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.deleteVoice).not.toHaveBeenCalled();
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    },
  );

  it.each(["ready", "deleting"])("does not treat ownership or a repeated %s request as provider proof", async (status) => {
    mocks.maybeSingle.mockResolvedValue({ data: {
      id, user_id: userId, status, deleted_at: null,
      elevenlabs_voice_id: "synthetic-own-but-unverified-provider-voice",
    }, error: null });
    expect((await DELETE(request(), context)).status).toBe(409);
    expect((await DELETE(request(), context)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it.each([null, { id, user_id: "another-user", deleted_at: null }])(
    "does not expose or mutate a missing or unowned voice",
    async (data) => {
      mocks.maybeSingle.mockResolvedValue({ data, error: null });
      expect((await DELETE(request(), context)).status).toBe(404);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.deleteVoice).not.toHaveBeenCalled();
    },
  );

  it("keeps already deleted rows idempotent without provider calls", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id, user_id: userId, deleted_at: "2026-09-01T00:00:00Z" }, error: null });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, alreadyDeleted: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it.each([401, 403])("preserves the authorization boundary (%s)", async (status) => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await DELETE(request(), context)).status).toBe(status);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs before looking up a voice", async () => {
    expect((await DELETE(request(), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("does not attempt deletion when the database lookup fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "synthetic lookup failure" } });
    expect((await DELETE(request(), context)).status).toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });
});
