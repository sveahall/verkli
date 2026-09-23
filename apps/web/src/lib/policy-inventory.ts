export type PolicyInventoryRow = {
  policyname: string;
  cmd: string;
  permissive: string;
  roles: string[];
  qual: string | null;
  with_check?: string | null;
};

const WRITE_COMMANDS = new Set(["INSERT", "UPDATE", "ALL"]);
const CLIENT_ROLES = new Set(["public", "anon", "authenticated"]);

/** True once the live function returns WITH CHECK. A missing key means the old function. */
export function inventoryReportsWithCheck(rows: PolicyInventoryRow[]): boolean {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, "with_check"));
}

function isLiteralTrue(expression: string | null | undefined): boolean {
  if (!expression) return false;
  const stripped = expression.trim().replace(/^\(+/, "").replace(/\)+$/, "").trim();
  return stripped.toLowerCase() === "true";
}

/**
 * A write policy whose WITH CHECK is literally true lets a client role write
 * any row. Null WITH CHECK is not that: Postgres then reuses USING.
 */
const VERSION_SCOPED_WRITES = new Set(["INSERT", "UPDATE", "DELETE", "ALL"]);

/**
 * Chapter rows carry both book_id and book_version_id. A permissive write
 * policy that only checks one of them ORs with the stricter policies, so an
 * author can point the other column at someone else's book.
 */
export function chapterWritesIgnoringVersion(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (!VERSION_SCOPED_WRITES.has(row.cmd)) return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return !blob.includes("book_version_id");
  });
}

/** A published-status SELECT ignores visibility. Followers-only books become public. */
export function publishedStatusSelects(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.cmd !== "SELECT" || row.permissive !== "PERMISSIVE") return false;
    const qual = row.qual ?? "";
    return /status\s*=\s*'PUBLISHED'/.test(qual) && !qual.includes("can_view_book");
  });
}

/** USING (true) hands every row to anyone, including drafts. */
export function unconditionalSelects(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter(
    (row) => row.cmd === "SELECT" && row.permissive === "PERMISSIVE" && isLiteralTrue(row.qual)
  );
}

/** Insert or update that can point a review at a book the caller cannot see. */
export function reviewWritesSkippingVisibility(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (row.cmd !== "INSERT" && row.cmd !== "UPDATE" && row.cmd !== "ALL") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return !blob.includes("can_view_book");
  });
}

/** Highlight writes that only check the owner can point at a chapter the caller cannot read. */
export function highlightWritesSkippingChapter(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (row.cmd !== "INSERT" && row.cmd !== "UPDATE" && row.cmd !== "ALL") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return !blob.includes("can_view_book");
  });
}

/**
 * Shelf rows are public when the profile is public. A write or a public read
 * that never calls can_view_book can pin a hidden book id onto that shelf.
 * Own-shelf SELECTs name auth.uid() and stay allowed.
 */
export function shelfBooksExposingHiddenBooks(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    if (blob.includes("can_view_book")) return false;
    if (row.cmd === "SELECT") return !blob.includes("auth.uid()");
    return row.cmd === "INSERT" || row.cmd === "UPDATE" || row.cmd === "ALL";
  });
}

/** Joining a book club only checked the caller id, so a private club was open. */
export function clubJoinsSkippingPrivacy(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (row.cmd !== "INSERT" && row.cmd !== "ALL") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return !blob.includes("is_public");
  });
}

/**
 * A public poll or club row carries a book id. The write must name can_view_book
 * so the id cannot be a book the caller neither wrote nor can read.
 */
export function bookPointersSkippingVisibility(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (row.cmd !== "INSERT" && row.cmd !== "UPDATE" && row.cmd !== "ALL") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return !blob.includes("can_view_book");
  });
}

/**
 * is_active alone publishes the question and the options. A poll on an
 * unpublished book must stay with its author until the book is visible.
 */
export function activePollsIgnoringVisibility(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    if (row.cmd !== "SELECT" && row.cmd !== "INSERT" && row.cmd !== "ALL") return false;
    const blob = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    return blob.includes("is_active") && !blob.includes("can_view_book");
  });
}

/** Inbox rows are written by the service role. A client INSERT can address anyone. */
export function clientNotificationInserts(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter(
    (row) => row.permissive === "PERMISSIVE" && (row.cmd === "INSERT" || row.cmd === "ALL"),
  );
}

/**
 * An active author_subscriptions row is treated as a purchase by the audiobook
 * gate. Clients may read their own row. They must not write one.
 */
export function clientSubscriptionWrites(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    return row.cmd === "INSERT" || row.cmd === "UPDATE" || row.cmd === "DELETE" || row.cmd === "ALL";
  });
}

/**
 * Conversation and message writes go through the service role, which applies
 * the request and block rules. A client write can open an accepted thread or
 * retarget its participants.
 */
export function clientMessageWrites(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (row.permissive !== "PERMISSIVE") return false;
    return row.cmd === "INSERT" || row.cmd === "UPDATE" || row.cmd === "DELETE" || row.cmd === "ALL";
  });
}

export function openClientWritePolicies(rows: PolicyInventoryRow[]): PolicyInventoryRow[] {
  return rows.filter((row) => {
    if (!WRITE_COMMANDS.has(row.cmd)) return false;
    if (!isLiteralTrue(row.with_check)) return false;
    return row.roles.some((role) => CLIENT_ROLES.has(role));
  });
}
