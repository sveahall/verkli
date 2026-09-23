import { agents, getAgent, type AgentAvailability, type AgentId } from "./agents";

/**
 * What each team member says when the author arrives on the dashboard: an
 * update when something happened, otherwise a question that suggests the next
 * step. Pure, so the copy rules are testable without rendering the page.
 */
export type BriefingAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "create"; label: string };

export type Briefing = {
  agent: AgentId;
  kind: "update" | "question" | "unavailable";
  message: string;
  action: BriefingAction | null;
};

export type BriefingEvent = { label: string; bookTitle: string; when: string };

export type BriefingInput = {
  book: { id: string; title: string; lastEdited: string } | null;
  /** Formatted sales headline, e.g. "1.2K SEK". Null when nothing has sold. */
  sales: string | null;
  topCountry: string | null;
  readers: number;
  comments: number;
  reviews: number;
  latest: { translation?: BriefingEvent; audiobook?: BriefingEvent; publish?: BriefingEvent };
  enabled: AgentAvailability;
};

function panelHref(agent: AgentId, bookId: string) {
  return `/author/books/${encodeURIComponent(bookId)}?panel=${getAgent(agent).panel}`;
}

/** "Yesterday" reads as "yesterday" mid-sentence; a calendar date takes "on". */
export function inSentence(when: string): string {
  return /\d{4}$/.test(when) ? `on ${when}` : when.toLowerCase();
}

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

function edith({ book }: BriefingInput): Omit<Briefing, "agent"> {
  if (!book) return { kind: "question", message: "Every book starts with a first page. Shall we write yours?", action: { kind: "create", label: "Start a book" } };
  return { kind: "question", message: `Shall we pick up “${book.title}”? You last worked on it ${inSentence(book.lastEdited)}.`, action: { kind: "link", label: "Keep writing", href: panelHref("edith", book.id) } };
}

function alma({ book, latest }: BriefingInput): Omit<Briefing, "agent"> {
  if (latest.translation) return { kind: "update", message: `${latest.translation.label}: “${latest.translation.bookTitle}”, ${inSentence(latest.translation.when)}.`, action: { kind: "link", label: "Open translations", href: "/author/production" } };
  if (!book) return { kind: "question", message: "Once you have a manuscript, I can take it into another language.", action: null };
  return { kind: "question", message: `Would “${book.title}” find new readers in another language?`, action: { kind: "link", label: "Explore a translation", href: panelHref("alma", book.id) } };
}

function august({ book, latest }: BriefingInput): Omit<Briefing, "agent"> {
  if (latest.audiobook) return { kind: "update", message: `${latest.audiobook.label}: “${latest.audiobook.bookTitle}”, ${inSentence(latest.audiobook.when)}.`, action: { kind: "link", label: "Listen", href: "/author/production" } };
  if (!book) return { kind: "question", message: "When your first chapters are ready, we can give them a voice.", action: null };
  return { kind: "question", message: `Shall we hear how “${book.title}” sounds read aloud?`, action: { kind: "link", label: "Try a voice", href: panelHref("august", book.id) } };
}

function stella({ book, readers, comments, reviews, latest }: BriefingInput): Omit<Briefing, "agent"> {
  if (readers > 0) {
    const reactions = [comments > 0 && plural(comments, "comment"), reviews > 0 && plural(reviews, "review")].filter(Boolean).join(" and ");
    return { kind: "update", message: `${plural(readers, "reader")} ${readers === 1 ? "has" : "have"} opened your books${reactions ? `, leaving ${reactions}` : ""}.`, action: { kind: "link", label: "Meet your readers", href: "/author/analytics/readers" } };
  }
  if (latest.publish) return { kind: "question", message: `“${latest.publish.bookTitle}” is out. Shall we tell people about it?`, action: book ? { kind: "link", label: "Draft a campaign", href: panelHref("stella", book.id) } : null };
  if (!book) return { kind: "question", message: "When your story is ready, I’ll help you introduce it to readers.", action: null };
  return { kind: "question", message: `Who is “${book.title}” for? Let’s find the words that make them curious.`, action: { kind: "link", label: "Work on marketing", href: panelHref("stella", book.id) } };
}

function marcus({ book, sales, topCountry }: BriefingInput): Omit<Briefing, "agent"> {
  if (sales) return { kind: "update", message: `You’ve earned ${sales} from paid orders${topCountry ? `. Most buyers are in ${topCountry}` : ""}.`, action: { kind: "link", label: "See sales", href: "/author/analytics/sales" } };
  if (!book) return { kind: "question", message: "When a book is on its way, we’ll decide together what it should cost.", action: null };
  return { kind: "question", message: `No sales yet. Shall we check the price of “${book.title}”?`, action: { kind: "link", label: "Review pricing", href: panelHref("ernst", book.id) } };
}

const speakers: Record<AgentId, (input: BriefingInput) => Omit<Briefing, "agent">> = { edith, alma, august, stella, ernst: marcus };

export function buildTeamBriefing(input: BriefingInput): Briefing[] {
  return agents.map(({ id }) => input.enabled[id]
    ? { agent: id, ...speakers[id](input) }
    : { agent: id, kind: "unavailable", message: "Joining the team later in the beta.", action: null });
}

/**
 * Rotating, personal welcome. Picked on the server (seeded by the hour) so the
 * client renders the same string it was sent, with no hydration mismatch.
 */
const GREETINGS = [
  (name: string) => `Great to see you${name}. Let’s get going!`,
  (name: string) => `Welcome back${name}. Your team is ready.`,
  (name: string) => `Good to have you here${name}. Where shall we start?`,
  (name: string) => `Hi${name}! The team has been expecting you.`,
  (name: string) => `There you are${name}. Let’s make today count.`,
] as const;

export function pickGreeting(firstName: string | null, seed: number): string {
  const name = firstName?.trim() ? `, ${firstName.trim()}` : "";
  const index = ((Math.floor(seed) % GREETINGS.length) + GREETINGS.length) % GREETINGS.length;
  return GREETINGS[index](name);
}

export function firstNameOf(value: string | null | undefined): string | null {
  const first = value?.trim().split(/\s+/)[0];
  return first && !first.includes("@") ? first : null;
}
