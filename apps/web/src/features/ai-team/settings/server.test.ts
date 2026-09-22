import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "./contracts";
import { getAiSettings, requireAiEnabled, saveAiSettings } from "./server";

function database(result: { data: unknown; error?: unknown }) {
  const upserts: unknown[] = [];
  const client = {
    from: () => {
      const query: Record<string, unknown> = {};
      for (const name of ["select", "eq"]) query[name] = () => query;
      query.maybeSingle = () => Promise.resolve({ error: null, ...result });
      query.upsert = (values: unknown) => {
        upserts.push(values);
        return Promise.resolve({ error: (result as { error?: unknown }).error ?? null });
      };
      return query;
    },
  };
  return { client: client as unknown as Parameters<typeof getAiSettings>[0], upserts };
}

const owner = "11111111-1111-4111-8111-111111111111";
const row = {
  ai_enabled: true, enabled: false, reply_style: "candid", warmth: "less", enthusiasm: "standard",
  structure: "more", emoji: "less", match_writing_voice: true,
  nickname: "Svea", craft: "Historical fiction", about: null, instructions: "Never rewrite dialogue.",
};

describe("AI settings server", () => {
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it("treats a first-time author with no row as the default account", async () => {
    const db = database({ data: null });
    expect(await getAiSettings(db.client, owner)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("maps a stored row, turning absent free text into empty strings", async () => {
    const db = database({ data: row });
    expect(await getAiSettings(db.client, owner)).toEqual({
      aiEnabled: true, memoryEnabled: false, replyStyle: "candid", warmth: "less", enthusiasm: "standard",
      structure: "more", emoji: "less", matchWritingVoice: true,
      nickname: "Svea", craft: "Historical fiction", about: "", instructions: "Never rewrite dialogue.",
    });
  });

  /**
   * ai_enabled defaults to true, so an outage must not read as "carry on":
   * that would run AI for exactly the accounts that asked for none.
   */
  it("refuses to guess when the settings row cannot be read", async () => {
    const db = database({ data: null, error: { code: "PGRST301" } });
    await expect(getAiSettings(db.client, owner)).rejects.toMatchObject({ code: "AI_SETTINGS_UNAVAILABLE", status: 503 });
    await expect(requireAiEnabled(db.client, owner)).rejects.toMatchObject({ status: 503 });
  });

  it("blocks with 403 when the account turned AI off, and passes the settings through when on", async () => {
    await expect(requireAiEnabled(database({ data: { ...row, ai_enabled: false } }).client, owner))
      .rejects.toMatchObject({ code: "AI_DISABLED", status: 403 });
    await expect(requireAiEnabled(database({ data: row }).client, owner))
      .resolves.toMatchObject({ aiEnabled: true, replyStyle: "candid" });
  });

  it("stores blank free text as NULL so 'not set' has one representation", async () => {
    const db = database({ data: null });
    await saveAiSettings(db.client, owner, { ...DEFAULT_AI_SETTINGS, nickname: "Svea", craft: "", about: "  ", instructions: "" });
    expect(db.upserts[0]).toMatchObject({ owner_id: owner, nickname: "Svea", craft: null, about: null, instructions: null });
  });
});
