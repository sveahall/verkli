import { describe, expect, it } from "vitest";
import { buildConversationHistory } from "./conversation-history";

describe("specialist conversation history", () => {
  it("keeps a cover proposal in history so follow-ups can revise the same composition", () => {
    const result = buildConversationHistory([{role:"assistant",content:"Review this direction.",actions:[{kind:"cover_brief",prompt:"A blue harbour at dusk",style:"minimal",reason:"A quiet atmosphere."}]}]);
    expect(result[0].content).toContain("A blue harbour at dusk");
    expect(result[0].content).toContain("Proposed only");
  });
  it("reports an actual completion separately from a pending proposal", () => {
    const result = buildConversationHistory([{role:"assistant",content:"Consider it.",actions:[{kind:"edit_text",original:"wierd",replacement:"weird",reason:"Spelling"}], outcomes:["Applied to your draft."]}]);
    expect(result[0].content).toContain('"outcome":"Applied to your draft."');
  });
  it("omits failed messages and bounds the number and size of preceding turns", () => {
    const result = buildConversationHistory(Array.from({length:20}, (_, index) => ({role:"user" as const,content:"x".repeat(5000),failed:index === 19})));
    expect(result).toHaveLength(12);
    expect(result.every((message) => message.content.length <= 4000)).toBe(true);
  });
});
