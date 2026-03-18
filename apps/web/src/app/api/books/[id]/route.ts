import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  normalizePriceCurrency,
  normalizePriceAmount,
  normalizePricingModel,
  isFreePriceAmount,
  isPaidPriceAmount,
  type PriceCurrency,
  type PricingModel,
} from "@/lib/books/pricing";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_BOOK_SETTINGS_LOAD_FAILED,
  E_BOOK_SETTINGS_UPDATE_FAILED,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_PRICING,
  E_INVALID_JSON,
  E_INVALID_PRICE_AMOUNT,
  E_INVALID_PRICE_CURRENCY,
  E_INVALID_PRICING_MODEL,
  E_INVALID_IS_FREE,
  E_INVALID_PRICING_COMBINATION,
  E_NO_UPDATABLE_FIELDS,
  E_PAID_BOOK_REQUIRES_CURRENCY,
} from "@/lib/api-errors";

type BookSettingsRow = {
  id: string;
  title: string;
  author_id: string;
  price_amount: number | null;
  price_currency: string | null;
  pricing_model: string | null;
  is_free?: boolean | null;
  updated_at?: string | null;
};

type PricingPatchBody = {
  price_amount?: unknown;
  price_currency?: unknown;
  pricing_model?: unknown;
  is_free?: unknown;
};

type NormalizedStoredPricing = {
  priceAmount: number | null;
  priceCurrency: PriceCurrency;
  pricingModel: PricingModel;
};

function badRequest(key: string, details?: Record<string, string>) {
  return apiError(key, 400, details ? { details } : undefined);
}

function normalizeStoredPricing(row: BookSettingsRow): NormalizedStoredPricing | null {
  const amount = normalizePriceAmount(row.price_amount);
  if (amount != null && amount < 0) return null;

  const isFree = isFreePriceAmount(amount);
  const currency = normalizePriceCurrency(row.price_currency);
  if (!isFree && !currency) return null;

  const model = normalizePricingModel(row.pricing_model ?? "book_only");
  if (!model) return null;

  return {
    priceAmount: amount,
    priceCurrency: currency ?? "USD",
    pricingModel: model,
  };
}

function toPricingResponse(book: BookSettingsRow, pricing: NormalizedStoredPricing) {
  return {
    id: book.id,
    title: book.title,
    price_amount: pricing.priceAmount,
    price_currency: pricing.priceCurrency,
    pricing_model: pricing.pricingModel,
    is_free:
      typeof book.is_free === "boolean" ? book.is_free : isFreePriceAmount(pricing.priceAmount),
    updated_at: book.updated_at ?? null,
  };
}

function parsePricingPatch(
  body: PricingPatchBody,
  current: { priceAmount: number | null; priceCurrency: PriceCurrency; pricingModel: PricingModel }
):
  | { ok: true; updates: { price_amount?: number | null; price_currency?: PriceCurrency; pricing_model?: PricingModel } }
  | { ok: false; response: NextResponse } {
  const hasPriceAmount = Object.prototype.hasOwnProperty.call(body, "price_amount");
  const hasPriceCurrency = Object.prototype.hasOwnProperty.call(body, "price_currency");
  const hasPricingModel = Object.prototype.hasOwnProperty.call(body, "pricing_model");
  const hasIsFree = Object.prototype.hasOwnProperty.call(body, "is_free");

  if (!hasPriceAmount && !hasPriceCurrency && !hasPricingModel && !hasIsFree) {
    return {
      ok: false,
      response: badRequest(E_NO_UPDATABLE_FIELDS),
    };
  }

  let nextAmount = current.priceAmount;
  let nextCurrency = current.priceCurrency;
  let nextModel = current.pricingModel;

  if (hasPriceAmount) {
    const value = body.price_amount;
    if (value === null) {
      nextAmount = null;
    } else if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
      if (value < 0) {
        return {
          ok: false,
          response: badRequest(E_INVALID_PRICE_AMOUNT),
        };
      }
      nextAmount = value;
    } else {
      return {
        ok: false,
        response: badRequest(E_INVALID_PRICE_AMOUNT),
      };
    }
  }

  if (hasPriceCurrency) {
    const currency = normalizePriceCurrency(body.price_currency);
    if (!currency) {
      return {
        ok: false,
        response: badRequest(E_INVALID_PRICE_CURRENCY),
      };
    }
    nextCurrency = currency;
  }

  if (hasPricingModel) {
    const model = normalizePricingModel(body.pricing_model);
    if (!model) {
      return {
        ok: false,
        response: badRequest(E_INVALID_PRICING_MODEL),
      };
    }
    nextModel = model;
  }

  if (hasIsFree) {
    if (typeof body.is_free !== "boolean") {
      return {
        ok: false,
        response: badRequest(E_INVALID_IS_FREE),
      };
    }

    if (body.is_free) {
      if (hasPriceAmount && nextAmount !== null && nextAmount !== 0) {
        return {
          ok: false,
          response: badRequest(E_INVALID_PRICING_COMBINATION),
        };
      }
      nextAmount = 0;
    } else if (!isPaidPriceAmount(nextAmount)) {
      return {
        ok: false,
        response: badRequest(E_INVALID_PRICING_COMBINATION),
      };
    }
  }

  if (isPaidPriceAmount(nextAmount) && !nextCurrency) {
    return {
      ok: false,
      response: badRequest(E_PAID_BOOK_REQUIRES_CURRENCY),
    };
  }

  const updates: { price_amount?: number | null; price_currency?: PriceCurrency; pricing_model?: PricingModel } = {};

  if (hasPriceAmount || hasIsFree) {
    updates.price_amount = nextAmount;
  }
  if (hasPriceCurrency) {
    updates.price_currency = nextCurrency;
  }
  if (hasPricingModel) {
    updates.pricing_model = nextModel;
  }

  return { ok: true, updates };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("books")
    .select("id, title, author_id, price_amount, price_currency, pricing_model, is_free, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[books.settings.get] failed", {
      bookId: id,
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return apiError(E_BOOK_SETTINGS_LOAD_FAILED, 500);
  }

  const row = book as BookSettingsRow | null;
  if (!row || row.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const normalized = normalizeStoredPricing(row);
  if (!normalized) {
    console.error("[books.settings.get] stored pricing is invalid", {
      bookId: id,
      userId: user.id,
      priceAmount: row.price_amount,
      priceCurrency: row.price_currency,
      pricingModel: row.pricing_model,
    });
    return apiError(E_INVALID_BOOK_PRICING, 500);
  }

  return NextResponse.json(toPricingResponse(row, normalized));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let body: PricingPatchBody & { setup_state?: unknown };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return badRequest(E_INVALID_JSON);
    }
    body = parsed as PricingPatchBody & { setup_state?: unknown };
  } catch {
    return badRequest(E_INVALID_JSON);
  }

  // ── setup_state-only update (fast path) ──────────────────────────────
  if (
    body.setup_state !== undefined &&
    !Object.prototype.hasOwnProperty.call(body, "price_amount") &&
    !Object.prototype.hasOwnProperty.call(body, "price_currency") &&
    !Object.prototype.hasOwnProperty.call(body, "pricing_model") &&
    !Object.prototype.hasOwnProperty.call(body, "is_free")
  ) {
    const supabase = await createClient();
    const { error: setupError } = await supabase
      .from("books")
      .update({ setup_state: body.setup_state } as never)
      .eq("id", id)
      .eq("author_id", user.id);

    if (setupError) {
      console.error("[books.settings.patch] setup_state update failed", {
        bookId: id,
        userId: user.id,
        code: setupError.code,
        message: setupError.message,
      });
      return apiError(E_BOOK_SETTINGS_UPDATE_FAILED, 500);
    }

    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, price_amount, price_currency, pricing_model, is_free")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("[books.settings.patch] lookup failed", {
      bookId: id,
      userId: user.id,
      code: bookError.code,
      message: bookError.message,
    });
    return apiError(E_BOOK_SETTINGS_UPDATE_FAILED, 500);
  }

  const row = book as BookSettingsRow | null;
  if (!row || row.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const normalized = normalizeStoredPricing(row);
  if (!normalized) {
    console.error("[books.settings.patch] stored pricing is invalid", {
      bookId: id,
      userId: user.id,
      priceAmount: row.price_amount,
      priceCurrency: row.price_currency,
      pricingModel: row.pricing_model,
    });
    return apiError(E_INVALID_BOOK_PRICING, 500);
  }

  const parsedPatch = parsePricingPatch(body, {
    priceAmount: normalized.priceAmount,
    priceCurrency: normalized.priceCurrency,
    pricingModel: normalized.pricingModel,
  });

  if (!parsedPatch.ok) return parsedPatch.response;

  const updates = parsedPatch.updates;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(toPricingResponse(row, normalized));
  }

  const { data: updated, error: updateError } = await supabase
    .from("books")
    .update(updates)
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id, title, author_id, price_amount, price_currency, pricing_model, is_free, updated_at")
    .single();

  if (updateError) {
    console.error("[books.settings.patch] update failed", {
      bookId: id,
      userId: user.id,
      code: updateError.code,
      message: updateError.message,
    });
    return apiError(E_BOOK_SETTINGS_UPDATE_FAILED, 500);
  }

  const updatedRow = updated as BookSettingsRow;
  const normalizedUpdated = normalizeStoredPricing(updatedRow);
  if (!normalizedUpdated) {
    console.error("[books.settings.patch] updated pricing is invalid", {
      bookId: id,
      userId: user.id,
      priceAmount: updatedRow.price_amount,
      priceCurrency: updatedRow.price_currency,
      pricingModel: updatedRow.pricing_model,
    });
    return apiError(E_INVALID_BOOK_PRICING, 500);
  }

  return NextResponse.json(toPricingResponse(updatedRow, normalizedUpdated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id } = await params;

  // SECURITY: Require author role for book deletion
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("[delete-book] bookId=%s lookup error=%s", id, bookError.message);
    return NextResponse.json({ ok: false, error: E_DATABASE_ERROR }, { status: 500 });
  }

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: E_BOOK_NOT_FOUND }, { status: 404 });
  }

  // Use admin client for cleanup of tables without CASCADE or with RLS restrictions
  const admin = createAdminClient();
  const warnings: string[] = [];

  // 1. Collect chapter IDs before book deletion cascades them
  const { data: chapters } = await admin
    .from("chapters")
    .select("id")
    .eq("book_id", id);

  const chapterIds = (chapters ?? []).map((c: { id: string }) => c.id);

  // 2. Delete chapter_audio_cache (no FK to books; chapters will cascade away)
  if (chapterIds.length > 0) {
    const { error: cacheError } = await admin
      .from("chapter_audio_cache")
      .delete()
      .in("chapter_id", chapterIds);

    if (cacheError) {
      console.error("[delete-book] bookId=%s step=chapter_audio_cache error=%s", id, cacheError.message);
      warnings.push("chapter_audio_cache_cleanup_failed");
    }
  }

  // 3. Delete ai_jobs referencing this book.
  //    Rows with book_id set will also cascade when the book is deleted,
  //    but we delete explicitly to capture errors. Legacy rows (book_id IS NULL)
  //    need manual cleanup via input JSONB.
  const { error: jobsByColError } = await admin
    .from("ai_jobs")
    .delete()
    .eq("book_id", id);

  if (jobsByColError) {
    console.error("[delete-book] bookId=%s step=ai_jobs(book_id) error=%s", id, jobsByColError.message);
    warnings.push("ai_jobs_cleanup_failed");
  }

  // Legacy rows where book_id wasn't backfilled
  const { data: legacyJobs } = await admin
    .from("ai_jobs")
    .select("id, input")
    .eq("user_id", user.id)
    .is("book_id", null);

  const legacyJobIds = (legacyJobs ?? [])
    .filter((j: { id: string; input: unknown }) => {
      const input = j.input as Record<string, unknown> | null;
      return input?.bookId === id;
    })
    .map((j: { id: string }) => j.id);

  if (legacyJobIds.length > 0) {
    const { error: legacyError } = await admin
      .from("ai_jobs")
      .delete()
      .in("id", legacyJobIds);

    if (legacyError) {
      console.error("[delete-book] bookId=%s step=ai_jobs(legacy) error=%s", id, legacyError.message);
      warnings.push("ai_jobs_legacy_cleanup_failed");
    }
  }

  // 4. Delete book_imports (ON DELETE SET NULL would leave orphan rows)
  const { error: importsError } = await admin
    .from("book_imports")
    .delete()
    .eq("book_id", id);

  if (importsError) {
    console.error("[delete-book] bookId=%s step=book_imports error=%s", id, importsError.message);
    warnings.push("book_imports_cleanup_failed");
  }

  // 5. Delete the book — cascades: chapters, book_versions, audiobook_assets,
  //    marketing_campaigns, translations
  const { error: deleteError } = await admin
    .from("books")
    .delete()
    .eq("id", id)
    .eq("author_id", user.id);

  if (deleteError) {
    console.error("[delete-book] bookId=%s step=books error=%s", id, deleteError.message);
    return NextResponse.json({ ok: false, error: E_DATABASE_ERROR }, { status: 500 });
  }

  return NextResponse.json(warnings.length > 0 ? { ok: true, warnings } : { ok: true });
}
