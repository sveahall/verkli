/**
 * The tools that run during the model's turn.
 *
 * Nothing here writes. Their job is to let the agent answer "where does this
 * word appear" without the book being pasted into the prompt: a search over a
 * 300-page manuscript costs the same handful of tokens as one over a 30-page
 * one, because what comes back is match records, not chapters.
 *
 * Every match is registered against the hash of the chapter it was found in.
 * That registration is what a later write tool refers to, and what makes the
 * plan checkable at apply time.
 */

import { findTextMatches } from "@/lib/tiptap-text-offsets";
import { countWords } from "@/lib/tiptap-content";
import type { AgentBook, AgentChapter } from "./book-context";
import { MAX_CHAPTER_CHARS, MAX_MATCHES_PER_SEARCH, type ToolInput } from "./tools";

export type RegisteredMatch = {
  id: string;
  chapterId: string;
  /** The chapter as it read when this position was measured. */
  chapterHash: string;
  from: number;
  to: number;
  /** The matched text exactly as it appears, which is where casing comes from. */
  text: string;
  before: string;
  after: string;
};

/**
 * Match ids are scoped to one run and handed to the model as opaque strings.
 * The model never invents a position, only quotes an id back — so a hallucinated
 * id fails a lookup instead of editing the wrong sentence.
 */
export class MatchRegistry {
  private counter = 0;
  private readonly entries = new Map<string, RegisteredMatch>();

  add(entry: Omit<RegisteredMatch, "id">): RegisteredMatch {
    const id = `m${++this.counter}`;
    const registered = { ...entry, id };
    this.entries.set(id, registered);
    return registered;
  }

  get(id: string): RegisteredMatch | undefined {
    return this.entries.get(id);
  }
}

const CONTEXT_CHARS = 60;

function chapterText(chapter: AgentChapter): string {
  if (!chapter.doc) return "";
  return chapter.doc.textBetween(0, chapter.doc.content.size, "\n\n");
}

export function listChapters(book: AgentBook): string {
  return JSON.stringify({
    bookTitle: book.bookTitle,
    chapters: book.chapters.map((chapter) => ({
      chapterId: chapter.id,
      order: chapter.order,
      title: chapter.title,
      words: countWords(chapterText(chapter)),
      ...(chapter.unreadable ? { unreadable: chapter.unreadable } : {}),
    })),
  });
}

export function readChapter(book: AgentBook, input: ToolInput<"read_chapter">): string {
  const chapter = book.chapters.find((entry) => entry.id === input.chapterId);
  if (!chapter) return JSON.stringify({ error: "No chapter with that id in this edition. Call list_chapters first." });
  if (!chapter.doc) return JSON.stringify({ error: chapter.unreadable });

  const text = chapterText(chapter);
  // Head and tail, never just the head: "does this chapter end well" answered
  // from the opening is answered confidently and wrongly.
  const body = text.length <= MAX_CHAPTER_CHARS
    ? text
    : `${text.slice(0, Math.floor(MAX_CHAPTER_CHARS * 0.7))}\n\n[… middle of the chapter omitted …]\n\n${text.slice(-Math.floor(MAX_CHAPTER_CHARS * 0.3))}`;

  return JSON.stringify({
    chapterId: chapter.id,
    order: chapter.order,
    title: chapter.title,
    truncated: text.length > MAX_CHAPTER_CHARS,
    text: body,
  });
}

export function searchBook(book: AgentBook, registry: MatchRegistry, input: ToolInput<"search_book">): string {
  const found: { id: string; chapterId: string; chapterTitle: string; order: number; text: string; context: string }[] = [];
  const skipped: string[] = [];
  let total = 0;

  for (const chapter of book.chapters) {
    if (!chapter.doc) {
      skipped.push(chapter.title);
      continue;
    }
    const matches = findTextMatches(chapter.doc, input.query, {
      caseSensitive: input.caseSensitive ?? false,
      wholeWord: input.wholeWord ?? false,
      contextChars: CONTEXT_CHARS,
      limit: MAX_MATCHES_PER_SEARCH - total,
    });
    total += matches.length;
    for (const match of matches) {
      const text = chapter.doc.textBetween(match.from, match.to);
      const registered = registry.add({
        chapterId: chapter.id,
        chapterHash: chapter.hash,
        from: match.from,
        to: match.to,
        text,
        before: match.before ?? "",
        after: match.after ?? "",
      });
      found.push({
        id: registered.id,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        order: chapter.order,
        text,
        context: `${registered.before}«${text}»${registered.after}`,
      });
    }
    if (total >= MAX_MATCHES_PER_SEARCH) break;
  }

  return JSON.stringify({
    query: input.query,
    wholeWord: input.wholeWord ?? false,
    caseSensitive: input.caseSensitive ?? false,
    total,
    truncated: total >= MAX_MATCHES_PER_SEARCH,
    ...(skipped.length ? { chaptersNotSearched: skipped } : {}),
    matches: found,
  });
}
