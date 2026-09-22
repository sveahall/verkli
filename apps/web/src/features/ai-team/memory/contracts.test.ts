import { describe, expect, it } from "vitest";
import { conversationInputSchema, memoryMutationSchema } from "./contracts";

describe("private AI memory contracts", () => {
  it("requires an edition for edition memories and bounds explicit content", () => {
    expect(memoryMutationSchema.safeParse({ operation: "save", scope: "edition", content: "Use UK spelling" }).success).toBe(false);
    expect(memoryMutationSchema.safeParse({ operation: "save", scope: "author", content: "x".repeat(501) }).success).toBe(false);
    expect(memoryMutationSchema.parse({ operation: "save", scope: "book", content: "  Short sentences  " })).toMatchObject({ content: "Short sentences" });
  });
  it("requires a request identifier and an explicit temporary choice", () => {
    expect(conversationInputSchema.safeParse({ temporary: false }).success).toBe(false);
    expect(conversationInputSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111" }).success).toBe(false);
  });
});
