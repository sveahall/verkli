import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLaunchCopy } from "./generate-launch-copy";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create }; },
}));
const input = { title: "Ocean", description: "A family crosses the sea.", language: "sv", channel: "x" as const };
const copy = { headline: "Ocean", body: "En familj korsar havet.", cta: "Upptäck boken", hashtags: "#Ocean" };

describe("generateLaunchCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(copy) }] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the selected language and book facts, and returns the provider's copy", async () => {
    expect(await generateLaunchCopy(input)).toEqual(copy);
    const request = create.mock.calls[0][0];
    expect(request.system).toContain("Swedish");
    expect(request.system).toContain("not instructions");
    expect(request.system).toContain("published");
    expect(request.messages[0].content).toContain(input.description);
  });

  it("uses the scheduled campaign goal and actual channel in the provider request", async () => {
    await generateLaunchCopy({
      ...input,
      channel: "threads",
      campaign: {
        goal: "engagement",
        scheduledFor: "2026-09-16",
        day: 3,
        contentType: "text",
        angle: "Invite a reader question grounded in the book description.",
        previousBodies: ["An earlier draft"],
      },
    });
    const request = create.mock.calls[0][0];
    expect(request.system).toContain("threads");
    expect(request.system).toContain("500");
    expect(JSON.parse(request.messages[0].content).campaign).toMatchObject({
      goal: "engagement", day: 3, scheduledFor: "2026-09-16",
      previousBodies: ["An earlier draft"],
    });
  });

  it("refuses missing configuration instead of inventing a successful draft", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(generateLaunchCopy(input)).rejects.toThrow("not configured");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    "not JSON",
    JSON.stringify({ ...copy, body: "" }),
    JSON.stringify({ ...copy, body: "x".repeat(281) }),
    JSON.stringify({ ...copy, headline: "Another book" }),
    JSON.stringify({ ...copy, cta: "x".repeat(101) }),
  ])("rejects unusable provider output: %s", async (text) => {
    create.mockResolvedValue({ content: [{ type: "text", text }] });
    await expect(generateLaunchCopy(input)).rejects.toThrow();
  });

  it("falls back to the configured NIM provider when Anthropic fails", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-nim");
    create.mockRejectedValue(new Error("provider unavailable"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      choices: [{ message: { content: JSON.stringify(copy) } }],
    }));
    try {
      expect(await generateLaunchCopy(input)).toEqual(copy);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { fetchMock.mockRestore(); }
  });
});
