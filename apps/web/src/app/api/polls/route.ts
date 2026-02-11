import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPollsEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_POLLS_FEATURE_DISABLED,
  E_POLL_CREATE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const createPollBodySchema = z.object({
  question: z.string().min(1).max(500),
  options: z
    .array(z.string().min(1).max(200))
    .min(2)
    .max(10),
  book_id: z.string().uuid().optional(),
  closes_at: z.string().datetime().optional(),
});

type PollRow = {
  id: string;
  author_id: string;
  question: string;
  book_id: string | null;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
};

type PollOptionRow = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
  created_at: string;
};

export async function GET(request: Request) {
  if (!isPollsEnabled()) {
    return apiError(E_POLLS_FEATURE_DISABLED, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const url = new URL(request.url);
  const bookId = url.searchParams.get("book_id");

  let query = supabase
    .from("polls" as never)
    .select("id, author_id, question, book_id, is_active, closes_at, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (bookId) {
    query = query.eq("book_id", bookId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[polls] list failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_POLL_CREATE_FAILED, 500);
  }

  const polls = (data ?? []) as PollRow[];

  return NextResponse.json({ polls });
}

export async function POST(request: Request) {
  if (!isPollsEnabled()) {
    return apiError(E_POLLS_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = createPollBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { question, options, book_id, closes_at } = parsedBody.data;

  const supabase = await createClient();

  const { data: poll, error: pollError } = await supabase
    .from("polls" as never)
    .insert({
      author_id: user.id,
      question,
      book_id: book_id ?? null,
      closes_at: closes_at ?? null,
    } as never)
    .select("id, author_id, question, book_id, is_active, closes_at, created_at")
    .single();

  if (pollError || !poll) {
    console.error("[polls] create failed", {
      userId: user.id,
      message: pollError?.message,
      code: pollError?.code,
    });
    return apiError(E_POLL_CREATE_FAILED, 500);
  }

  const createdPoll = poll as PollRow;

  const optionRows = options.map((text, index) => ({
    poll_id: createdPoll.id,
    text,
    sort_order: index,
  }));

  const { data: createdOptions, error: optionsError } = await supabase
    .from("poll_options" as never)
    .insert(optionRows as never)
    .select("id, poll_id, text, sort_order, created_at");

  if (optionsError) {
    console.error("[polls] options create failed", {
      pollId: createdPoll.id,
      message: optionsError.message,
      code: optionsError.code,
    });
    return apiError(E_POLL_CREATE_FAILED, 500);
  }

  const pollOptions = (createdOptions ?? []) as PollOptionRow[];

  return NextResponse.json({ poll: createdPoll, options: pollOptions }, { status: 201 });
}
