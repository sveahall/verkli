import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_NO_ACTIVE_JOB,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_REQUEST_BODY,
} from "@/lib/api-errors";

const AI_JOB_KIND = "audiobook_generation";

type ActiveJobRow = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
};

type ControlAction = "pause" | "resume" | "cancel";

function isControlAction(value: string): value is ControlAction {
  return value === "pause" || value === "resume" || value === "cancel";
}

async function findActiveAudiobookJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookId: string
): Promise<ActiveJobRow | null> {
  const { data: byBookId, error: byBookIdError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byBookIdError) {
    console.warn("[audiobook control] failed active-job lookup by book_id:", byBookIdError.message);
  }
  if (byBookId) {
    return {
      id: byBookId.id,
      status: byBookId.status,
      output: (byBookId.output as Record<string, unknown> | null) ?? null,
      input: (byBookId.input as Record<string, unknown> | null) ?? null,
    };
  }

  const { data: legacyRows, error: legacyError } = await supabase
    .from("ai_jobs")
    .select("id, status, output, input")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .is("book_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (legacyError) {
    console.warn("[audiobook control] failed legacy active-job lookup:", legacyError.message);
    return null;
  }

  const legacy = (legacyRows ?? []).find((row) => {
    const input = row.input as Record<string, unknown> | null;
    return input?.bookId === bookId;
  });

  if (!legacy) return null;
  return {
    id: legacy.id,
    status: legacy.status,
    output: (legacy.output as Record<string, unknown> | null) ?? null,
    input: (legacy.input as Record<string, unknown> | null) ?? null,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { id: bookId } = await params;

  const body = await request
    .json()
    .catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (!isControlAction(actionRaw)) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "action must be one of: pause, resume, cancel",
    });
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[audiobook control] book fetch failed:", bookError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const activeJob = await findActiveAudiobookJob(supabase, user.id, bookId);
  if (!activeJob) {
    return apiError(E_AUDIOBOOK_NO_ACTIVE_JOB, 409);
  }

  const currentOutput = (activeJob.output as Record<string, unknown> | null) ?? {};
  const nextOutput: Record<string, unknown> = { ...currentOutput };

  if (actionRaw === "pause") {
    nextOutput.pauseRequested = true;
    nextOutput.cancelRequested = false;
    nextOutput.controlState = "pause_requested";
  } else if (actionRaw === "resume") {
    nextOutput.pauseRequested = false;
    nextOutput.cancelRequested = false;
    nextOutput.controlState = "running";
  } else {
    nextOutput.pauseRequested = false;
    nextOutput.cancelRequested = true;
    nextOutput.controlState = "cancel_requested";
    nextOutput.cancelRequestedAt = new Date().toISOString();
  }

  const { error: updateError } = await admin
    .from("ai_jobs")
    .update({ output: nextOutput })
    .eq("id", activeJob.id);

  if (updateError) {
    console.error("[audiobook control] failed to update control flags:", updateError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({
    ok: true,
    jobId: activeJob.id,
    action: actionRaw,
    controlState: nextOutput.controlState,
  });
}
