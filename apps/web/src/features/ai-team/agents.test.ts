import { describe, expect, it } from "vitest";
import { agents, getAgentAction, getAgentForPanel } from "./agents";

describe("agent tool entry points", () => {
  it.each([
    ["edith", "ai"], ["alma", "translate"], ["august", "audiobook"], ["stella", "market"], ["ernst", "pricing"],
  ] as const)("opens %s in its existing book tool", (id, panel) => {
    expect(getAgentAction(id, "book-123", true, true)).toMatchObject({ kind: "link", href: `/author/books/book-123?panel=${panel}` });
    expect(getAgentForPanel(panel)?.id).toBe(id);
  });

  it.each(agents)("never routes $name into an unavailable feature", ({ id }) => {
    for (const workspace of [true, false]) {
      expect(getAgentAction(id, "book-123", false, workspace)).toEqual({ kind: "unavailable", label: "Not available in this beta" });
    }
  });

  it("gives authors without a book a creation action, not a broken book URL", () => {
    expect(getAgentAction("edith", null, true, true)).toEqual({ kind: "create", label: "Create a book to start" });
  });

  it("sends visitors to the actual signup anchor without exposing book routes", () => {
    expect(getAgentAction("edith", "book-123", true, false)).toMatchObject({ href: "/waitlist#join-waitlist" });
  });

  it("does not attach an unrelated persona to other panels", () => {
    expect(getAgentForPanel("cover")).toBeUndefined();
    expect(getAgentForPanel("publish")).toBeUndefined();
  });
});
