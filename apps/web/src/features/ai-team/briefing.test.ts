import { describe, expect, it } from "vitest";
import { buildTeamBriefing, firstNameOf, inSentence, pickGreeting, type BriefingInput } from "./briefing";

const base: BriefingInput = {
  book: { id: "b1", title: "The Lake", lastEdited: "Yesterday" },
  sales: null,
  topCountry: null,
  readers: 0,
  comments: 0,
  reviews: 0,
  latest: {},
  enabled: { edith: true, alma: true, august: true, stella: true, ernst: true },
};

const byAgent = (input: BriefingInput) => Object.fromEntries(buildTeamBriefing(input).map((item) => [item.agent, item]));

describe("buildTeamBriefing", () => {
  it("gives every team member one line, in team order", () => {
    expect(buildTeamBriefing(base).map((item) => item.agent)).toEqual(["edith", "alma", "august", "stella", "ernst"]);
  });

  it("puts the sales update under Marcus, with the top country", () => {
    const marcus = byAgent({ ...base, sales: "1.2K SEK", topCountry: "Sweden" }).ernst;
    expect(marcus.kind).toBe("update");
    expect(marcus.message).toBe("You’ve earned 1.2K SEK from paid orders. Most buyers are in Sweden.");
    expect(marcus.action).toEqual({ kind: "link", label: "See sales", href: "/author/analytics/sales" });
  });

  it("has Marcus ask about pricing when nothing has sold", () => {
    const marcus = byAgent(base).ernst;
    expect(marcus.kind).toBe("question");
    expect(marcus.action).toMatchObject({ href: "/author/books/b1?panel=pricing" });
  });

  it("reports readers and reactions through Stella", () => {
    expect(byAgent({ ...base, readers: 1, comments: 2 }).stella.message).toBe("1 reader has opened your books, leaving 2 comments.");
  });

  it("relays finished production work as updates", () => {
    const team = byAgent({ ...base, latest: { audiobook: { label: "Audiobook ready", bookTitle: "The Lake", when: "2h ago" } } });
    expect(team.august).toMatchObject({ kind: "update", message: "Audiobook ready: “The Lake”, 2h ago." });
  });

  it("offers to start a book when there is none", () => {
    const team = byAgent({ ...base, book: null });
    expect(team.edith.action).toEqual({ kind: "create", label: "Start a book" });
    expect(team.alma.action).toBeNull();
  });

  it("never offers a tool that is switched off", () => {
    const alma = byAgent({ ...base, enabled: { ...base.enabled, alma: false } }).alma;
    expect(alma).toMatchObject({ kind: "unavailable", action: null });
  });
});

describe("inSentence", () => {
  it("lowercases relative time and puts \"on\" before a date", () => {
    expect(inSentence("Yesterday")).toBe("yesterday");
    expect(inSentence("Sep 16, 2026")).toBe("on Sep 16, 2026");
    expect(byAgent({ ...base, book: { id: "b1", title: "The Lake", lastEdited: "Sep 16, 2026" } }).edith.message).toBe("Shall we pick up “The Lake”? You last worked on it on Sep 16, 2026.");
  });
});

describe("pickGreeting", () => {
  it("greets by first name and rotates with the seed", () => {
    expect(pickGreeting("Hannes", 0)).toBe("Great to see you, Hannes. Let’s get going!");
    expect(pickGreeting("Hannes", 1)).not.toBe(pickGreeting("Hannes", 0));
    expect(pickGreeting("Hannes", 5)).toBe(pickGreeting("Hannes", 0));
  });

  it("stays grammatical without a name", () => {
    expect(pickGreeting(null, 3)).toBe("Hi! The team has been expecting you.");
  });
});

describe("firstNameOf", () => {
  it("takes the first word and ignores email-like names", () => {
    expect(firstNameOf("  Hannes Berg ")).toBe("Hannes");
    expect(firstNameOf("hannes@verkli.com")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});
