import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create };
    static APIConnectionTimeoutError = class extends Error {};
    static AuthenticationError = class extends Error {};
  }
  return { default: FakeAnthropic };
});

import { chapterSchema } from "@/lib/tiptap-schema";
import { hashChapterContent, type AgentBook } from "./book-context";
import { runAgent } from "./loop";

function book(): AgentBook {
  const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Johan gick." }] }] };
  return {
    bookId: "00000000-0000-4000-8000-00000000000b",
    versionId: "00000000-0000-4000-8000-0000000000ff",
    bookTitle: "Inget kan stoppa",
    chapters: [{
      id: "00000000-0000-4000-8000-000000000001", order: 1, title: "Hamnen",
      hash: hashChapterContent(JSON.stringify(json)),
      updatedAt: "2026-09-23T10:00:00Z", versionNumber: 1,
      doc: chapterSchema.nodeFromJSON(json), unreadable: null,
    }],
  };
}

const reply = (text: string) => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 10 },
});

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("runAgent", () => {
  it("bounds the closing message to what agent_plans.summary accepts", async () => {
    // The prompt asks for 120 words; max_tokens allows roughly 11 000
    // characters. Manuscript text reaches the model verbatim, so a book can ask
    // for a long closing message. Unbounded, the plan insert fails its CHECK
    // and every recorded step is discarded after the model has been paid.
    create.mockResolvedValue(reply("x".repeat(12_000)));

    const result = await runAgent({ book: book(), message: "Sammanfatta boken.", tool: "edit" });
    expect(result.summary).toHaveLength(4_000);
  });

  it("leaves an ordinary reply untouched", async () => {
    create.mockResolvedValue(reply("Jag hittade tre förekomster av Johan."));
    const result = await runAgent({ book: book(), message: "Hitta Johan.", tool: "edit" });
    expect(result.summary).toBe("Jag hittade tre förekomster av Johan.");
    expect(result.stoppedBecause).toBe("finished");
  });

  it("refuses to start without a provider key rather than failing mid-run", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(runAgent({ book: book(), message: "x", tool: "edit" })).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(create).not.toHaveBeenCalled();
  });
});
