import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chapterSchema } from "@/lib/tiptap-schema";
import { findTextMatches } from "@/lib/tiptap-text-offsets";
import { hashChapterContent, type AgentBook, type AgentChapter } from "./book-context";
import type { Plan, PlannedMatch } from "./plan";
import { applyPlan } from "./apply";

const authorize = vi.fn();
const loadDraft = vi.fn();
const saveDraft = vi.fn();
vi.mock("@/lib/book-production/server", () => ({
  authorizeProductionEdition: (...args: unknown[]) => authorize(...args),
  loadProductionDraft: (...args: unknown[]) => loadDraft(...args),
  saveProductionDraft: (...args: unknown[]) => saveDraft(...args),
}));

const BOOK = "00000000-0000-4000-8000-00000000000b";
const VERSION = "00000000-0000-4000-8000-0000000000ff";
const ONE = "00000000-0000-4000-8000-000000000001";
const TWO = "00000000-0000-4000-8000-000000000002";

function chapter(id: string, order: number, title: string, text: string): AgentChapter {
  const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
  return {
    id, order, title,
    hash: hashChapterContent(JSON.stringify(json)),
    updatedAt: "2026-09-22T10:00:00Z",
    versionNumber: 3,
    doc: chapterSchema.nodeFromJSON(json),
    unreadable: null,
  };
}

/** Builds a chapter from arbitrary inline nodes, so marks can be placed exactly. */
function richChapter(id: string, order: number, title: string, paragraphs: unknown[][]): AgentChapter {
  const json = { type: "doc", content: paragraphs.map((content) => ({ type: "paragraph", content })) };
  return {
    id, order, title,
    hash: hashChapterContent(JSON.stringify(json)),
    updatedAt: "2026-09-22T10:00:00Z", versionNumber: 3,
    doc: chapterSchema.nodeFromJSON(json), unreadable: null,
  };
}

/** Real positions, derived the same way search_book derives them. */
function plannedFor(source: AgentChapter, query: string, replacement: string): PlannedMatch[] {
  return findTextMatches(source.doc!, query, { caseSensitive: true }).map((found, index) => ({
    matchId: `p${index}`, chapterId: source.id, chapterTitle: source.title, chapterHash: source.hash,
    from: found.from, to: found.to, text: query, before: "", after: "", replacement, preselected: true,
  }));
}

function book(): AgentBook {
  return {
    bookId: BOOK, versionId: VERSION, bookTitle: "Inget kan stoppa",
    chapters: [
      chapter(ONE, 1, "Hamnen", "Johan gick. Johan stannade."),
      chapter(TWO, 2, "Färjan", "Johans väska stod kvar."),
    ],
  };
}

type Write = { table: string; values: Record<string, unknown>; filters: Record<string, unknown> };

/** Mirrors the compare-and-swap the real table write uses; `conflict` makes it lose. */
function fakeSupabase(conflict: boolean | "error" = false) {
  const writes: Write[] = [];
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) { filters[column] = value; return chain; },
            async select() {
              writes.push({ table, values, filters });
              if (conflict === "error") return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
              return conflict ? { data: [], error: null } : { data: [{ id: filters.id }], error: null };
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}

function match(target: AgentBook, chapterIndex: number, id: string, from: number, to: number, text: string, replacement: string, preselected: boolean): PlannedMatch {
  const source = target.chapters[chapterIndex];
  return {
    matchId: id, chapterId: source.id, chapterTitle: source.title, chapterHash: source.hash,
    from, to, text, before: "", after: "", replacement, preselected,
  };
}

function renamePlan(target: AgentBook): Plan {
  return {
    versionId: VERSION,
    steps: [{
      id: "s1", tool: "replace_in_book", reason: "Rename.", replacement: "Jonas",
      matches: [
        match(target, 0, "m1", 1, 6, "Johan", "Jonas", true),
        match(target, 0, "m2", 13, 18, "Johan", "Jonas", true),
        match(target, 1, "m3", 1, 6, "Johan", "Jonas", false),
      ],
    }],
  };
}

beforeEach(() => {
  authorize.mockReset();
  loadDraft.mockReset();
  saveDraft.mockReset();
});

describe("applyPlan", () => {
  it("writes only the ticked matches, and only to the chapters they are in", async () => {
    const target = book();
    const { client, writes } = fakeSupabase();
    const outcomes = await applyPlan(client, target, renamePlan(target));

    expect(outcomes).toEqual([{ stepId: "s1", tool: "replace_in_book", status: "applied", detail: "2 passages changed.", changed: 2 }]);
    expect(writes).toHaveLength(1);
    expect(writes[0].filters).toEqual({
      book_id: BOOK, id: ONE, updated_at: "2026-09-22T10:00:00Z", version_number: 3,
    });
    expect(JSON.parse(writes[0].values.content as string).content[0].content[0].text).toBe("Jonas gick. Jonas stannade.");
  });

  it("lets the author tick a match the agent left unticked", async () => {
    const target = book();
    const { client, writes } = fakeSupabase();
    const outcomes = await applyPlan(client, target, renamePlan(target), { matchIds: ["m3"] });

    expect(outcomes[0].changed).toBe(1);
    expect(writes.map((write) => write.filters.id)).toEqual([TWO]);
    // The genitive the author opted into: "Johans" becomes "Jonass", exactly as
    // the plan showed it. Nothing quietly fixes the extra s.
    expect(JSON.parse(writes[0].values.content as string).content[0].content[0].text).toBe("Jonass väska stod kvar.");
  });

  it("refuses a chapter the author has edited since the plan was made", async () => {
    const target = book();
    const plan = renamePlan(target);
    target.chapters[0].hash = "the-author-typed-something";
    const { client, writes } = fakeSupabase();

    const outcomes = await applyPlan(client, target, plan);
    expect(writes).toHaveLength(0);
    expect(outcomes[0]).toMatchObject({ status: "skipped", changed: 0 });
    expect(outcomes[0].detail).toMatch(/after the plan was made/);
  });

  it("reports nothing as changed when the chapter moves between read and write", async () => {
    const target = book();
    const { client, writes } = fakeSupabase(true);
    const outcomes = await applyPlan(client, target, renamePlan(target));

    expect(writes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "skipped", changed: 0 });
  });

  it("reports every way a step failed, not whichever came last", async () => {
    // A step can span chapters and fail differently in each. Overwriting one
    // reason with another meant the author heard about the formatting seam and
    // never learned that a whole chapter's passages had been skipped too.
    const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
    const stale = richChapter(ONE, 1, "Hamnen", [[text("Johansson kom.")]]);
    const seam = richChapter(TWO, 2, "Färjan", [[text("Jo"), text("han", [{ type: "bold" }]), text("sson gick.")]]);
    const target: AgentBook = { bookId: BOOK, versionId: VERSION, bookTitle: "Inget kan stoppa", chapters: [stale, seam] };
    const matches = [...plannedFor(stale, "Johansson", "Karlsson"), ...plannedFor(seam, "Johansson", "Karlsson")];
    expect(matches).toHaveLength(2);

    // The author typed in the first chapter after the plan was made.
    stale.hash = "the-author-typed-something";

    const outcomes = await applyPlan(fakeSupabase().client, target, {
      versionId: VERSION,
      steps: [{ id: "s1", tool: "replace_in_book", reason: "Rename.", replacement: "Karlsson", matches }],
    });

    // Both reasons, in one detail: the chapter the author edited, and the seam.
    expect(outcomes[0].detail).toMatch(/edited since/);
    expect(outcomes[0].detail).toMatch(/formatting/);
  });

  it("does not blame the author when the database is what failed", async () => {
    // The CAS branch and the error branch were one condition, so a statement
    // timeout was reported as "you edited this chapter after the plan was
    // made" — and the plan is spent either way, so the wrong explanation costs
    // the author another run on top of the confusion.
    const target = book();
    const { client } = fakeSupabase("error");
    const outcomes = await applyPlan(client, target, renamePlan(target));

    expect(outcomes[0]).toMatchObject({ changed: 0 });
    expect(outcomes[0].detail).toMatch(/database did not accept/i);
    expect(outcomes[0].detail).not.toMatch(/you edited/i);
  });

  it("saves cover text through the production module, at the revision it read", async () => {
    const target = book();
    authorize.mockResolvedValue({ marker: "context" });
    loadDraft.mockResolvedValue({ settings: null, revision: 7 });
    saveDraft.mockResolvedValue({ revision: 8 });
    const { client } = fakeSupabase();

    const outcomes = await applyPlan(client, target, {
      versionId: VERSION,
      steps: [
        { id: "s1", tool: "set_cover_text", reason: "Back copy.", fields: { backText: "En roman om att inte ge upp." } },
        { id: "s2", tool: "set_cover_style", reason: "Warmer.", fields: { background: "#f4efe6" } },
      ],
    });

    expect(authorize).toHaveBeenCalledWith(BOOK, VERSION);
    const [, settings, revision] = saveDraft.mock.calls[0];
    expect(settings.cover.backText).toBe("En roman om att inte ge upp.");
    expect(settings.cover.background).toBe("#f4efe6");
    // Seeded from the book, so an author who has never opened Cover still gets
    // a valid layout rather than a rejected save.
    expect(settings.title).toBe("Inget kan stoppa");
    expect(revision).toBe(7);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["applied", "applied"]);
  });

  it("reports both halves when some passages apply and one cannot", async () => {
    // The common shape of a whole-book rename: most matches are plain text, one
    // straddles a bold run. Counting per step instead of per passage used to
    // report the entire step as "Nothing was changed".
    const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
    const source = richChapter(ONE, 1, "Hamnen", [
      [text("Johansson kom.")],
      [text("Johansson gick.")],
      [text("Jo"), text("han", [{ type: "bold" }]), text("sson stannade.")],
    ]);
    const target: AgentBook = { bookId: BOOK, versionId: VERSION, bookTitle: "Inget kan stoppa", chapters: [source] };
    const matches = plannedFor(source, "Johansson", "Karlsson");
    expect(matches).toHaveLength(3);

    const { client, writes } = fakeSupabase();
    const outcomes = await applyPlan(client, target, {
      versionId: VERSION,
      steps: [{ id: "s1", tool: "replace_in_book", reason: "Rename.", replacement: "Karlsson", matches }],
    });

    expect(outcomes[0]).toMatchObject({ status: "applied", changed: 2 });
    expect(outcomes[0].detail).toMatch(/2 passages changed\..*formatting/);
    const written = JSON.parse(writes[0].values.content as string).content;
    expect(written[0].content[0].text).toBe("Karlsson kom.");
    expect(written[1].content[0].text).toBe("Karlsson gick.");
    // The one it could not do is left exactly as it was, bold intact.
    expect(written[2].content.map((node: { text: string }) => node.text)).toEqual(["Jo", "han", "sson stannade."]);
  });

  it("says so when only some of a step's chapters are stale", async () => {
    const target = book();
    const plan = renamePlan(target);
    target.chapters[1].hash = "the-author-typed-something";
    const { client } = fakeSupabase();

    const outcomes = await applyPlan(client, target, plan, { matchIds: ["m1", "m2", "m3"] });
    expect(outcomes[0]).toMatchObject({ status: "applied", changed: 2 });
    expect(outcomes[0].detail).toMatch(/1 passage was in a chapter you have edited since/);
  });

  it("appends a front-matter page through the production settings, keeping the existing ones", async () => {
    authorize.mockResolvedValue({ marker: "context" });
    loadDraft.mockResolvedValue({ settings: null, revision: 2 });
    saveDraft.mockResolvedValue({ revision: 3 });

    const outcomes = await applyPlan(fakeSupabase().client, book(), {
      versionId: VERSION,
      steps: [{ id: "s1", tool: "add_front_matter_section", reason: "Dedication.", kind: "dedication", title: "Tillägnan", body: "Till Mira." }],
    });

    const [, settings] = saveDraft.mock.calls[0];
    // The seed already carries title, copyright and contents; a new page is
    // appended rather than replacing them.
    expect(settings.sections.map((section: { kind: string }) => section.kind)).toEqual(["title", "copyright", "contents", "dedication"]);
    const added = settings.sections.at(-1);
    expect({ title: added.title, body: added.body, placement: added.placement, enabled: added.enabled }).toEqual({
      title: "Tillägnan", body: "Till Mira.", placement: "before", enabled: true,
    });
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(outcomes[0]).toMatchObject({ status: "applied" });
  });

  it("writes the description through the author's own client, so RLS is the ownership check", async () => {
    const { client, writes } = fakeSupabase();
    const outcomes = await applyPlan(client, book(), {
      versionId: VERSION,
      steps: [{ id: "s1", tool: "set_book_description", reason: "Blurb.", description: "En roman om att inte ge upp." }],
    });

    expect(writes).toEqual([{ table: "books", values: { description: "En roman om att inte ge upp." }, filters: { id: BOOK } }]);
    expect(outcomes[0]).toMatchObject({ status: "applied" });
  });

  it("hands cover generation back to the panel that owns its spend limit", async () => {
    const outcomes = await applyPlan(fakeSupabase().client, book(), {
      versionId: VERSION,
      steps: [{ id: "s1", tool: "generate_cover_image", reason: "New direction.", prompt: "A harbour at dusk", style: "photographic" }],
    });
    expect(outcomes[0]).toMatchObject({ status: "deferred" });
  });
});
