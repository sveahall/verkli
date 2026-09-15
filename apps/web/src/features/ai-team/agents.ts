export const agents = [
  {
    id: "edith", name: "Edith", role: "Editor", panel: "ai",
    headline: "Your voice. A fresh perspective.",
    description: "Explore a stronger opening, a different rhythm or a more natural line of dialogue. Bring a passage to Edith, then decide what belongs in your book.",
    tasks: ["Writing feedback", "Pacing & dialogue", "Passage rewrites"],
    action: "Write with Edith", note: "AI suggestions. Your final word.",
  },
  {
    id: "alma", name: "Alma", role: "Translator", panel: "translate",
    headline: "Another language. Still your story.",
    description: "Take your manuscript into a new language. Work chapter by chapter, compare the translation with your original, and review the result before publishing.",
    tasks: ["Chapter translations", "Source comparison", "Edition review"],
    action: "Translate with Alma", note: "Review each translation before sharing it.",
  },
  {
    id: "august", name: "August", role: "Audiobook producer", panel: "audiobook",
    headline: "A voice for every chapter.",
    description: "Choose a voice, turn your chapters into narration and listen to the result. August is the face of your audio workspace, from first preview to your finished edition.",
    tasks: ["Voice selection", "Chapter narration", "Audio previews"],
    action: "Create audio with August", note: "Listen and review before publishing.",
  },
  {
    id: "stella", name: "Stella", role: "Marketer", panel: "market",
    headline: "A good story deserves an introduction.",
    description: "Explore campaign copy inspired by your book. Shape the message for your audience and review every draft before you share it.",
    tasks: ["Campaign drafts", "Channel-specific copy", "Your approval"],
    action: "Open Stella’s workspace", note: "You choose what gets shared.",
  },
  {
    id: "ernst", name: "Ernst", role: "Pricing & earnings", panel: "pricing",
    headline: "Your book. Your terms.",
    description: "Set your book’s price and currency, choose how readers pay, and keep your publishing decisions in one place. Ernst is your guide to the pricing workspace.",
    tasks: ["Book pricing", "Currency", "Purchase options"],
    action: "Set pricing with Ernst", note: "Your pricing controls. No automatic financial decisions.",
  },
] as const;

export type Agent = (typeof agents)[number];
export type AgentId = Agent["id"];
export type AgentAvailability = Record<AgentId, boolean>;

export function getAgent(id: AgentId): Agent {
  return agents.find((agent) => agent.id === id)!;
}

export function getAgentForPanel(panel: string): Agent | undefined {
  return agents.find((agent) => agent.panel === panel);
}

/** Navigation only: personas never bypass the tool's auth, billing or feature gates. */
export function getAgentAction(id: AgentId, bookId: string | null, enabled: boolean, workspace: boolean) {
  if (!enabled) return { kind: "unavailable", label: "Not available in this beta" } as const;
  if (!workspace) return { kind: "link", label: "Get early access", href: "/waitlist#join-waitlist" } as const;
  if (!bookId) return { kind: "create", label: "Create a book to start" } as const;
  const agent = getAgent(id);
  return { kind: "link", label: agent.action, href: `/author/books/${encodeURIComponent(bookId)}?panel=${agent.panel}` } as const;
}
