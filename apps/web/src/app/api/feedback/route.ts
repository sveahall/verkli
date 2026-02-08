import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_FEEDBACK_LOAD_FAILED,
  E_FEEDBACK_SAVE_FAILED,
} from "@/lib/api-errors";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data, error } = await supabase
    .from("feedback")
    .select("id, type, message, url, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[feedback] load failed", { message: error.message });
    return apiError(E_FEEDBACK_LOAD_FAILED, 500);
  }

  return NextResponse.json({ feedback: data ?? [] });
}

const feedbackBodySchema = z.object({
  type: z.enum(["bug", "idea", "other"], { message: "Invalid type" }),
  message: z.string().min(1, "Message required").max(2000),
  url: z.string().max(2000).optional().nullable(),
  request_id: z.string().max(100).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = feedbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { type, message, url, request_id } = parsed.data;

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      user_id: user?.id ?? null,
      type,
      message: message.trim(),
      url: url?.trim() || null,
      request_id: request_id?.trim() || null,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[feedback] save failed", { message: error.message });
    return apiError(E_FEEDBACK_SAVE_FAILED, 500);
  }

  return NextResponse.json({ id: data.id, created_at: data.created_at }, { status: 200 });
}
