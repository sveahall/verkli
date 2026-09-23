import { describe, expect, it } from "vitest";
import {
  chapterWritesIgnoringVersion,
  clientMessageWrites,
  clientNotificationInserts,
  clientSubscriptionWrites,
  clubJoinsSkippingPrivacy,
  bookPointersSkippingVisibility,
  inventoryReportsWithCheck,
  openClientWritePolicies,
  publishedStatusSelects,
  highlightWritesSkippingChapter,
  reviewWritesSkippingVisibility,
  shelfBooksExposingHiddenBooks,
  unconditionalSelects,
  type PolicyInventoryRow,
} from "./policy-inventory";

const base: PolicyInventoryRow = {
  policyname: "chapters_insert_own",
  cmd: "INSERT",
  permissive: "PERMISSIVE",
  roles: ["authenticated"],
  qual: null,
  with_check: "((author_id = auth.uid()))",
};

describe("openClientWritePolicies", () => {
  it("flags a client write policy whose check is true", () => {
    const open = { ...base, policyname: "chapters_write_all", with_check: "(true)" };
    expect(openClientWritePolicies([base, open]).map((row) => row.policyname)).toEqual(["chapters_write_all"]);
  });

  it("leaves a null check alone, because Postgres reuses USING", () => {
    expect(openClientWritePolicies([{ ...base, with_check: null }])).toEqual([]);
  });

  it("ignores an open check that only service_role can use", () => {
    expect(openClientWritePolicies([{ ...base, roles: ["service_role"], with_check: "true" }])).toEqual([]);
  });
});

describe("chapterWritesIgnoringVersion", () => {
  it("flags a write policy that never mentions the version", () => {
    const loose: PolicyInventoryRow = {
      ...base,
      policyname: "Author manages own chapters",
      cmd: "ALL",
      roles: ["public"],
      qual: "(books.id = chapters.book_id)",
      with_check: "(books.id = chapters.book_id)",
    };
    const scoped: PolicyInventoryRow = {
      ...base,
      policyname: "Authors can insert chapters",
      qual: null,
      with_check: "(bv.id = chapters.book_version_id)",
    };
    expect(chapterWritesIgnoringVersion([loose, scoped]).map((row) => row.policyname)).toEqual([
      "Author manages own chapters",
    ]);
  });
});

describe("publishedStatusSelects", () => {
  it("flags a published-status select that skips can_view_book", () => {
    const loose: PolicyInventoryRow = {
      ...base,
      policyname: "audiobook_assets_select",
      cmd: "SELECT",
      qual: "(status = 'PUBLISHED'::book_status)",
      with_check: null,
    };
    const scoped: PolicyInventoryRow = {
      ...loose,
      policyname: "visible",
      qual: "(can_view_book(id, auth.uid()))",
    };
    expect(publishedStatusSelects([loose, scoped]).map((row) => row.policyname)).toEqual([
      "audiobook_assets_select",
    ]);
  });
});

describe("unconditionalSelects", () => {
  it("flags a select whose expression is true", () => {
    const open: PolicyInventoryRow = {
      ...base,
      policyname: "reviews_select",
      cmd: "SELECT",
      qual: "true",
      with_check: null,
    };
    expect(unconditionalSelects([open, base]).map((row) => row.policyname)).toEqual(["reviews_select"]);
  });
});

describe("reviewWritesSkippingVisibility", () => {
  it("flags an update that can move a review onto a hidden book", () => {
    const update: PolicyInventoryRow = {
      ...base,
      policyname: "reviews_update_own",
      cmd: "UPDATE",
      qual: "(auth.uid() = user_id)",
      with_check: "(auth.uid() = user_id)",
    };
    const insert: PolicyInventoryRow = {
      ...update,
      policyname: "reviews_insert_own",
      cmd: "INSERT",
      qual: null,
      with_check: "(auth.uid() = user_id) AND can_view_book(book_id, auth.uid())",
    };
    expect(reviewWritesSkippingVisibility([update, insert]).map((row) => row.policyname)).toEqual([
      "reviews_update_own",
    ]);
  });
});

describe("highlightWritesSkippingChapter", () => {
  it("flags an insert that does not require the chapter to be visible", () => {
    const insert: PolicyInventoryRow = {
      ...base,
      policyname: "highlights_insert_own",
      with_check: "(auth.uid() = user_id)",
    };
    const gated: PolicyInventoryRow = {
      ...insert,
      policyname: "highlights_insert_visible",
      with_check: "(auth.uid() = user_id) AND can_view_book(book_id, auth.uid())",
    };
    expect(highlightWritesSkippingChapter([insert, gated]).map((row) => row.policyname)).toEqual([
      "highlights_insert_own",
    ]);
  });
});

describe("shelfBooksExposingHiddenBooks", () => {
  it("flags a public read and an insert that skip book visibility", () => {
    const publicRead: PolicyInventoryRow = {
      ...base,
      policyname: "Public shelf books are viewable",
      cmd: "SELECT",
      qual: "(profiles.is_public = true)",
      with_check: null,
    };
    const ownRead: PolicyInventoryRow = {
      ...publicRead,
      policyname: "shelf_books_select_own",
      qual: "(shelves.user_id = auth.uid())",
    };
    const looseInsert: PolicyInventoryRow = {
      ...base,
      policyname: "shelf_books_insert_own",
      with_check: "(shelves.user_id = auth.uid())",
    };
    expect(
      shelfBooksExposingHiddenBooks([publicRead, ownRead, looseInsert]).map((row) => row.policyname),
    ).toEqual(["Public shelf books are viewable", "shelf_books_insert_own"]);
  });
});

describe("clubJoinsSkippingPrivacy", () => {
  it("flags a join that does not require the club to be public", () => {
    const open: PolicyInventoryRow = {
      ...base,
      policyname: "book_club_members_insert",
      with_check: "(user_id = auth.uid())",
    };
    const gated: PolicyInventoryRow = {
      ...open,
      policyname: "book_club_members_insert_public",
      with_check: "(user_id = auth.uid()) AND (is_public OR creator_id = auth.uid())",
    };
    expect(clubJoinsSkippingPrivacy([open, gated]).map((row) => row.policyname)).toEqual([
      "book_club_members_insert",
    ]);
  });
});

describe("bookPointersSkippingVisibility", () => {
  it("flags a poll write that can point at a hidden book", () => {
    const insert: PolicyInventoryRow = {
      ...base,
      policyname: "polls_insert",
      with_check: "(auth.uid() = author_id)",
    };
    const update: PolicyInventoryRow = {
      ...insert,
      policyname: "polls_update",
      cmd: "UPDATE",
      qual: "(auth.uid() = author_id)",
      with_check: "(auth.uid() = author_id) AND can_view_book(book_id, auth.uid())",
    };
    expect(bookPointersSkippingVisibility([insert, update]).map((row) => row.policyname)).toEqual([
      "polls_insert",
    ]);
  });
});

describe("clientNotificationInserts", () => {
  it("flags any client insert into the inbox", () => {
    const insert: PolicyInventoryRow = {
      ...base,
      policyname: "notifications_insert_authenticated",
      with_check: "((auth.uid() = user_id) OR (auth.uid() = actor_id))",
    };
    expect(clientNotificationInserts([insert]).map((row) => row.policyname)).toEqual([
      "notifications_insert_authenticated",
    ]);
    expect(clientNotificationInserts([])).toEqual([]);
  });
});

describe("clientSubscriptionWrites", () => {
  it("flags an all-commands policy that lets a reader write their own subscription", () => {
    const own: PolicyInventoryRow = {
      ...base,
      policyname: "Subscriber owns their subscriptions",
      cmd: "ALL",
      qual: "(auth.uid() = subscriber_user_id)",
      with_check: null,
    };
    const read: PolicyInventoryRow = {
      ...own,
      policyname: "author_subscriptions_select_own",
      cmd: "SELECT",
    };
    expect(clientSubscriptionWrites([own, read]).map((row) => row.policyname)).toEqual([
      "Subscriber owns their subscriptions",
    ]);
  });
});

describe("clientMessageWrites", () => {
  it("flags a client insert that can open an accepted conversation", () => {
    const insert: PolicyInventoryRow = {
      ...base,
      policyname: "conversations_insert_participant",
      with_check: "(auth.uid() = created_by)",
    };
    const read: PolicyInventoryRow = {
      ...insert,
      policyname: "conversations_select_participant",
      cmd: "SELECT",
      qual: "(auth.uid() = participant_one_id)",
      with_check: null,
    };
    expect(clientMessageWrites([insert, read]).map((row) => row.policyname)).toEqual([
      "conversations_insert_participant",
    ]);
  });
});

describe("inventoryReportsWithCheck", () => {
  it("is false until the function actually returns the column", () => {
    const { with_check: _ignored, ...legacy } = base;
    expect(inventoryReportsWithCheck([legacy])).toBe(false);
    expect(inventoryReportsWithCheck([base])).toBe(true);
  });
});
