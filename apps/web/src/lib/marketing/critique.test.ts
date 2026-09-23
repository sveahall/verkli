import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MarketingWork } from "./model-work";
import { canRunLaunchCopyCritic, generateLaunchCopyWithCritic } from "./critique";

const { callOpenAi, isOpenAiConfigured, create } = vi.hoisted(() => ({
  callOpenAi: vi.fn(),
  isOpenAiConfigured: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/ai/providers/openai", () => ({ callOpenAi, isOpenAiConfigured, estimateOpenAiUnits: (request: object) => JSON.stringify(request).length + 4096 + 2400 }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));

const schema = z.object({
  headline: z.string().min(1).max(40),
  body: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.string().default(""),
});
const parse = (raw: string) => schema.parse(JSON.parse(raw));
const good = { headline: "Ocean", body: "A family crosses the sea.", cta: "Read it", hashtags: "#Ocean" };
const better = { ...good, body: "A family risks everything to cross the sea." };
const work: MarketingWork = { run: async input => input.call(async () => {}) };
const args = { work, system: "rules go here", content: JSON.stringify({ title: "Ocean" }), parse };

const critiqueReply = (issues: string[]) => ({
  id: "anthropic-receipt", model: "actual-critic-model", usage: { input_tokens: 9, output_tokens: 4 },
  content: [{ type: "text", text: JSON.stringify({ issues }) }],
});

describe("canRunLaunchCopyCritic", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires both providers, since the pass is generate-then-audit", () => {
    isOpenAiConfigured.mockReturnValue(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(canRunLaunchCopyCritic()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    expect(canRunLaunchCopyCritic()).toBe(true);
    isOpenAiConfigured.mockReturnValue(false);
    expect(canRunLaunchCopyCritic()).toBe(false);
  });
});

describe("generateLaunchCopyWithCritic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    isOpenAiConfigured.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns the first draft and skips revision when the critic finds nothing", async () => {
    callOpenAi.mockResolvedValueOnce(JSON.stringify(good));
    create.mockResolvedValue(critiqueReply([]));
    expect(await generateLaunchCopyWithCritic(args)).toEqual(good);
    expect(callOpenAi).toHaveBeenCalledTimes(1);
  });

  it("revises when the critic reports issues and returns the revision", async () => {
    callOpenAi
      .mockResolvedValueOnce(JSON.stringify(good))
      .mockResolvedValueOnce(JSON.stringify(better));
    create.mockResolvedValue(critiqueReply(["Body is generic; name the stakes."]));
    expect(await generateLaunchCopyWithCritic(args)).toEqual(better);
    expect(callOpenAi).toHaveBeenCalledTimes(2);
    // The revision request must carry the critique, not just retry blindly.
    expect(callOpenAi.mock.calls[1][0].user).toContain("Body is generic");
  });

  it("keeps the valid draft when the revision breaks a hard constraint", async () => {
    callOpenAi
      .mockResolvedValueOnce(JSON.stringify(good))
      .mockResolvedValueOnce(JSON.stringify({ ...good, headline: "x".repeat(200) }));
    create.mockResolvedValue(critiqueReply(["Headline could be punchier."]));
    expect(await generateLaunchCopyWithCritic(args)).toEqual(good);
  });

  it("tolerates markdown fences around the model's JSON", async () => {
    callOpenAi.mockResolvedValueOnce("```json\n" + JSON.stringify(good) + "\n```");
    create.mockResolvedValue(critiqueReply([]));
    expect(await generateLaunchCopyWithCritic(args)).toEqual(good);
  });

  it("uses the uncritiqued draft when the critic itself fails", async () => {
    callOpenAi.mockResolvedValueOnce(JSON.stringify(good));
    create.mockRejectedValue(new Error("anthropic down"));
    expect(await generateLaunchCopyWithCritic(args)).toEqual(good);
    expect(callOpenAi).toHaveBeenCalledTimes(1);
  });

  it("throws so the caller can fall back when neither draft nor revision validates", async () => {
    callOpenAi
      .mockResolvedValueOnce(JSON.stringify({ headline: "" }))
      .mockResolvedValueOnce(JSON.stringify({ headline: "" }));
    create.mockResolvedValue(critiqueReply(["Headline is empty."]));
    await expect(generateLaunchCopyWithCritic(args)).rejects.toThrow();
  });
});
