/**
 * Fail if the chapters paywall can be read around.
 *
 *   npm run check:rls-paywall              # a found hole exits 1; a missing key skips
 *   npm run check:rls-paywall -- --strict  # a skip exits 1 as well
 *
 * Why this exists
 * ---------------
 * On 2026-09-10 anon could fetch the complete text of a 49 kr book with one
 * curl. The SELECT policy the migrations define was correct. It did not
 * matter: two more permissive SELECT policies existed on `public.chapters`,
 * written by hand in the Supabase dashboard, present in no migration, each
 * granting every chapter of any book whose `books.status` said PUBLISHED —
 * no price check, no version check.
 *
 * PERMISSIVE policies OR together. One correct policy plus one careless one
 * equals the careless one. So "the policy in git is right" proves nothing,
 * and reviewing the diff could never have caught this. The only fact that
 * matters is how many permissive SELECT policies the live table actually has.
 *
 * Two independent checks, because either alone can pass while the paywall is
 * open:
 *
 *   1. Shape — exactly one PERMISSIVE SELECT policy on chapters. Catches a new
 *      dashboard policy the moment it appears, without needing a paid book to
 *      exist.
 *   2. Behaviour — the anon key cannot read chapters of any published paid
 *      book. Catches a policy that is single but wrong. Skipped with a clear
 *      message when nothing paid is published, which is the normal state.
 *
 * A skip is not a pass: without credentials it reports SKIPPED and, under
 * --strict, exits 1.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  activePollsIgnoringVisibility,
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
} from "../src/lib/policy-inventory";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const strict = process.argv.includes("--strict");

for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const problems: string[] = [];

function skip(reason: string): never {
  console.log(`⚠  SKIPPED — ${reason}`);
  if (strict) {
    console.error(`   --strict: a skip is not a pass.\n`);
    process.exit(1);
  }
  console.log("");
  process.exit(0);
}

type PolicyRow = {
  policyname: string;
  cmd: string;
  permissive: string;
  roles: string[];
  qual: string | null;
  with_check?: string | null;
};

async function main() {
  console.log(`\n══ RLS paywall check ══\n`);

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    skip("missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const svc = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  const anon = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  };

  // ── 1. Shape ──────────────────────────────────────────────────────────────
  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "chapters" }),
  });

  if (!invRes.ok) {
    const body = await invRes.text();
    if (invRes.status === 404) {
      skip(
        "public.policy_inventory() is missing — run `cd apps/web && npx supabase db push` " +
          "(migration 20260910150000)"
      );
    }
    console.error(`✖  policy_inventory failed: HTTP ${invRes.status} ${body.slice(0, 200)}\n`);
    process.exit(1);
  }

  const policies = (await invRes.json()) as PolicyRow[];
  const selects = policies.filter((p) => p.cmd === "SELECT");
  const permissive = selects.filter((p) => p.permissive === "PERMISSIVE");
  const restrictive = selects.filter((p) => p.permissive === "RESTRICTIVE");

  console.log(`chapters SELECT policies: ${permissive.length} permissive, ${restrictive.length} restrictive`);
  for (const p of selects) {
    const mark = p.permissive === "PERMISSIVE" ? "•" : "·";
    console.log(`   ${mark} [${p.permissive}] ${p.policyname}  roles=${p.roles.join(",")}`);
  }

  if (permissive.length > 1) {
    problems.push(
      `chapters has ${permissive.length} PERMISSIVE SELECT policies. They OR together, so the ` +
        `strictest one is irrelevant — any of the others can hand out paid chapters. ` +
        `Extra: ${permissive.map((p) => `"${p.policyname}"`).join(", ")}`
    );
  } else if (permissive.length === 0) {
    problems.push(
      "chapters has NO permissive SELECT policy. Nothing can read chapters, including buyers " +
        "and the authors who wrote them."
    );
  }

  // The paying half of the rule. A policy that never mentions entitlements is
  // one that cannot charge for anything.
  const paywallAware = permissive.some(
    (p) => p.qual?.includes("has_book_entitlement") || p.qual?.includes("entitlements")
  );
  if (permissive.length === 1 && !paywallAware) {
    problems.push(
      `the single permissive SELECT policy ("${permissive[0].policyname}") never consults ` +
        `entitlements, so a published paid book is readable by anyone.`
    );
  }

  const booksRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "books" }),
  });
  if (!booksRes.ok) {
    problems.push(`policy_inventory(books) failed: HTTP ${booksRes.status}`);
  } else {
    const bookPolicies = (await booksRes.json()) as PolicyRow[];
    const statusOnly = publishedStatusSelects(bookPolicies);
    if (statusOnly.length > 0) {
      problems.push(
        `books has a permissive SELECT that treats status = PUBLISHED as public and ignores ` +
          `can_view_book, so a followers-only book is readable by anyone: ` +
          statusOnly.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   books: no status-only public SELECT ✓`);
    }
  }

  const assetsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "audiobook_assets" }),
  });
  if (!assetsRes.ok) {
    problems.push(`policy_inventory(audiobook_assets) failed: HTTP ${assetsRes.status}`);
  } else {
    const assetPolicies = (await assetsRes.json()) as PolicyRow[];
    const statusAssets = publishedStatusSelects(assetPolicies);
    if (statusAssets.length > 0) {
      problems.push(
        `audiobook_assets has a permissive SELECT on status = PUBLISHED, so a published ` +
          `book's audio path is readable without can_view_book: ` +
          statusAssets.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   audiobook_assets: no status-only public SELECT ✓`);
    }
  }

  const reviewsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "reviews" }),
  });
  if (!reviewsRes.ok) {
    problems.push(`policy_inventory(reviews) failed: HTTP ${reviewsRes.status}`);
  } else {
    const reviewPolicies = (await reviewsRes.json()) as PolicyRow[];
    const openReviews = unconditionalSelects(reviewPolicies);
    const looseReviewWrites = reviewWritesSkippingVisibility(reviewPolicies);
    if (openReviews.length > 0) {
      problems.push(
        `reviews has a SELECT policy of true, so a draft book's reviews are readable by anyone: ` +
          openReviews.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else if (looseReviewWrites.length > 0) {
      problems.push(
        `reviews lets a signed-in user attach a review to a book they cannot see: ` +
          looseReviewWrites.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   reviews: no world-readable SELECT ✓`);
    }
  }

  const highlightsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "highlights" }),
  });
  if (!highlightsRes.ok) {
    problems.push(`policy_inventory(highlights) failed: HTTP ${highlightsRes.status}`);
  } else {
    const highlightPolicies = (await highlightsRes.json()) as PolicyRow[];
    const looseHighlights = highlightWritesSkippingChapter(highlightPolicies);
    if (looseHighlights.length > 0) {
      problems.push(
        `highlights lets a signed-in user attach a highlight to a chapter they cannot read: ` +
          looseHighlights.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   highlights: writes require a visible chapter ✓`);
    }
  }

  const shelfBooksRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "shelf_books" }),
  });
  if (!shelfBooksRes.ok) {
    problems.push(`policy_inventory(shelf_books) failed: HTTP ${shelfBooksRes.status}`);
  } else {
    const shelfPolicies = (await shelfBooksRes.json()) as PolicyRow[];
    const looseShelves = shelfBooksExposingHiddenBooks(shelfPolicies);
    if (looseShelves.length > 0) {
      problems.push(
        `shelf_books can place a hidden book on a shelf, and a public profile exposes that book id: ` +
          looseShelves.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   shelf_books: public shelves only show visible books ✓`);
    }
  }

  const clubMembersRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "book_club_members" }),
  });
  if (!clubMembersRes.ok) {
    problems.push(`policy_inventory(book_club_members) failed: HTTP ${clubMembersRes.status}`);
  } else {
    const memberPolicies = (await clubMembersRes.json()) as PolicyRow[];
    const openJoins = clubJoinsSkippingPrivacy(memberPolicies);
    if (openJoins.length > 0) {
      problems.push(
        `book_club_members lets a signed-in user join a private club and then read its messages: ` +
          openJoins.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   book_club_members: private clubs are not self-joinable ✓`);
    }
  }

  for (const table of ["polls", "book_clubs"] as const) {
    const pointerRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ p_table: table }),
    });
    if (!pointerRes.ok) {
      problems.push(`policy_inventory(${table}) failed: HTTP ${pointerRes.status}`);
      continue;
    }
    const pointerPolicies = (await pointerRes.json()) as PolicyRow[];
    const loosePointers = bookPointersSkippingVisibility(pointerPolicies);
    if (loosePointers.length > 0) {
      problems.push(
        `${table} lets a signed-in user attach a book they cannot see: ` +
          loosePointers.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   ${table}: book pointer requires a visible or owned book ✓`);
    }
  }

  for (const table of ["polls", "poll_options", "poll_votes"] as const) {
    const pollRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ p_table: table }),
    });
    if (!pollRes.ok) {
      problems.push(`policy_inventory(${table}) failed: HTTP ${pollRes.status}`);
      continue;
    }
    const pollPolicies = (await pollRes.json()) as PolicyRow[];
    const openPolls = activePollsIgnoringVisibility(pollPolicies);
    if (openPolls.length > 0) {
      problems.push(
        `${table} shows or accepts a vote on an active poll whose book is hidden: ` +
          openPolls.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   ${table}: an active poll follows book visibility ✓`);
    }
  }

  const notificationsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "notifications" }),
  });
  if (!notificationsRes.ok) {
    problems.push(`policy_inventory(notifications) failed: HTTP ${notificationsRes.status}`);
  } else {
    const notificationPolicies = (await notificationsRes.json()) as PolicyRow[];
    const clientInserts = clientNotificationInserts(notificationPolicies);
    if (clientInserts.length > 0) {
      problems.push(
        `notifications lets a signed-in user write into someone else's inbox: ` +
          clientInserts.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   notifications: no client insert ✓`);
    }
  }

  const subscriptionsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "author_subscriptions" }),
  });
  if (!subscriptionsRes.ok) {
    problems.push(`policy_inventory(author_subscriptions) failed: HTTP ${subscriptionsRes.status}`);
  } else {
    const subscriptionPolicies = (await subscriptionsRes.json()) as PolicyRow[];
    const subscriptionWrites = clientSubscriptionWrites(subscriptionPolicies);
    if (subscriptionWrites.length > 0) {
      problems.push(
        `author_subscriptions lets a signed-in reader write a subscription, which the audiobook gate treats as a purchase: ` +
          subscriptionWrites.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   author_subscriptions: clients cannot write a subscription ✓`);
    }
  }

  for (const table of ["conversations", "messages"] as const) {
    const messageRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ p_table: table }),
    });
    if (!messageRes.ok) {
      problems.push(`policy_inventory(${table}) failed: HTTP ${messageRes.status}`);
      continue;
    }
    const messagePolicies = (await messageRes.json()) as PolicyRow[];
    const messageWrites = clientMessageWrites(messagePolicies);
    if (messageWrites.length > 0) {
      problems.push(
        `${table} lets a signed-in user write messages outside the request flow: ` +
          messageWrites.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   ${table}: no client write ✓`);
    }
  }

  const listItemsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "curated_list_items" }),
  });
  if (!listItemsRes.ok) {
    problems.push(`policy_inventory(curated_list_items) failed: HTTP ${listItemsRes.status}`);
  } else {
    const listItemPolicies = (await listItemsRes.json()) as PolicyRow[];
    const openItems = unconditionalSelects(listItemPolicies);
    if (openItems.length > 0) {
      problems.push(
        `curated_list_items has a SELECT policy of true, so a draft book id on a list is readable ` +
          `by anyone: ` + openItems.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   curated_list_items: no world-readable SELECT ✓`);
    }
  }

  const unboundChapterWrites = chapterWritesIgnoringVersion(policies);
  if (unboundChapterWrites.length > 0) {
    problems.push(
      `chapters has a permissive write policy that never checks book_version_id, so it ORs ` +
        `with the version-scoped policies and a chapter can be attached to someone else's book: ` +
        unboundChapterWrites.map((p) => `"${p.policyname}"`).join(", ")
    );
  } else {
    console.log(`   chapters: every write policy checks book_version_id ✓`);
  }

  if (!inventoryReportsWithCheck(policies)) {
    console.log(
      `   note: policy_inventory does not return with_check yet. Apply ` +
        `20260922211000_policy_inventory_with_check.sql so open write policies are visible.`
    );
  } else {
    const openWrites = openClientWritePolicies(policies);
    if (openWrites.length > 0) {
      problems.push(
        `chapters has a write policy whose WITH CHECK is true for a client role: ` +
          openWrites.map((p) => `"${p.policyname}"`).join(", ")
      );
    } else {
      console.log(`   write policies: no WITH CHECK true for anon or authenticated ✓`);
    }
  }

  if (restrictive.length === 0) {
    console.log(
      `   note: no restrictive SELECT policy. chapters_hide_soft_deleted used to be one; ` +
        `if soft delete is still a thing, it is not being enforced here.`
    );
  }

  const openRpcs = [
    ["finalize_order_checkout_session", { p_stripe_session_id: "rls-probe-no-such-session" }],
    ["finalize_donation_checkout_session", { p_stripe_session_id: "rls-probe-no-such-session" }],
    ["finalize_credit_topup_checkout_session", { p_stripe_session_id: "rls-probe-no-such-session" }],
    ["grant_user_credits_once", { p_user_id: "not-a-uuid", p_delta: 1, p_source: "probe", p_source_id: "not-a-uuid" }],
    ["revoke_order_for_refund", { p_payment_intent_id: "rls-probe-no-such-intent" }],
    ["upsert_author_subscription", {
      p_subscriber_user_id: "not-a-uuid",
      p_author_id: "not-a-uuid",
      p_stripe_subscription_id: "probe",
      p_stripe_customer_id: "probe",
      p_amount_monthly: 0,
      p_currency: "sek",
      p_status: "active",
    }],
    ["update_author_subscription_status", { p_stripe_subscription_id: "rls-probe-no-such-id", p_status: "active" }],
    ["refresh_book_audiobook_status", { p_book_id: "not-a-uuid" }],
    ["dm_consume_rate_limit", { p_sender_id: "not-a-uuid" }],
  ] as const;
  const exposed: string[] = [];
  for (const [name, body] of openRpcs) {
    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { ...anon, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (rpcRes.status !== 401 && rpcRes.status !== 403 && rpcRes.status !== 404) {
        exposed.push(`${name} HTTP ${rpcRes.status}`);
      }
    } catch {
      exposed.push(`${name} timed out`);
    }
  }
  if (exposed.length > 0) {
    problems.push(
      `anon can call a service-role payment function: ${exposed.join(", ")}`
    );
  } else {
    console.log(`   payment functions: anon cannot execute them ✓`);
  }

  const entitlementRes = await fetch(
    `${SUPABASE_URL}/rest/v1/entitlements?select=user_id,book_id&limit=1`,
    { headers: svc }
  );
  const entitlementRows = entitlementRes.ok
    ? ((await entitlementRes.json()) as Array<{ user_id: string; book_id: string }>)
    : [];
  const sample = entitlementRows[0];
  if (sample) {
    const oracleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_book_entitlement`, {
      method: "POST",
      headers: anon,
      body: JSON.stringify({
        p_book_id: sample.book_id,
        p_chapter_id: null,
        p_user_id: sample.user_id,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const oracleText = await oracleRes.text();
    if (oracleText === "true") {
      problems.push(
        "has_book_entitlement tells anon whether another user owns a book"
      );
    } else {
      console.log(`   has_book_entitlement: anon cannot read another user's purchase ✓`);
    }
  }

  // ── 2. Behaviour ──────────────────────────────────────────────────────────
  const paidRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,price_amount&published=is.true&price_amount=gt.0&limit=1`,
    { headers: svc }
  );
  const paidBooks = paidRes.ok ? ((await paidRes.json()) as Array<{ id: string; title: string }>) : [];

  if (paidBooks.length === 0) {
    console.log(`\nbehaviour check: no published paid book exists, so there is nothing to probe.`);
    console.log(`   (the shape check above is what guards the paywall in this state)`);
  } else {
    const book = paidBooks[0];
    const leak = await fetch(
      `${SUPABASE_URL}/rest/v1/chapters?select=id&book_id=eq.${book.id}&limit=1`,
      { headers: anon }
    );
    const rows = leak.ok ? ((await leak.json()) as unknown[]) : [];
    if (rows.length > 0) {
      problems.push(
        `anon read a chapter of the published PAID book "${book.title}" (${book.id}). ` +
          `The paywall is open right now.`
      );
    } else {
      console.log(`\nbehaviour check: anon reads 0 chapters of the paid book "${book.title}" ✓`);
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  if (problems.length === 0) {
    console.log(`\n✅ paywall intact\n`);
    process.exit(0);
  }

  console.log(`\n❌ ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.log(`   • ${p}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n✖  check crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
