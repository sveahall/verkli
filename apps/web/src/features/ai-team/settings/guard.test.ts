import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireAiEnabled: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./server", async (original) => ({
  ...(await original<typeof import("./server")>()),
  requireAiEnabled: mocks.requireAiEnabled,
}));

import { AiSettingsError } from "./server";
import { aiDisabledResponse } from "./guard";

const owner = "11111111-1111-4111-8111-111111111111";

describe("AI route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it("lets the request through when the account has AI on", async () => {
    mocks.requireAiEnabled.mockResolvedValue({ aiEnabled: true });
    expect(await aiDisabledResponse(owner)).toBeNull();
  });

  it("answers 403 AI_DISABLED, so the switch holds against a stale tab or a direct POST", async () => {
    mocks.requireAiEnabled.mockRejectedValue(new AiSettingsError("AI_DISABLED", 403, "AI is turned off for your account."));
    const response = await aiDisabledResponse(owner);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ error: "AI_DISABLED" });
  });

  it("fails closed when the settings row cannot be read", async () => {
    mocks.requireAiEnabled.mockRejectedValue(new AiSettingsError("AI_SETTINGS_UNAVAILABLE", 503, "unavailable"));
    expect((await aiDisabledResponse(owner))?.status).toBe(503);
    mocks.requireAiEnabled.mockRejectedValue(new Error("connection reset"));
    expect((await aiDisabledResponse(owner))?.status).toBe(503);
  });
});
