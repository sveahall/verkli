import {
  apiError,
  E_INVALID_JSON,
  E_TRAILER_GENERATION_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import {
  generateTrailerPrompt,
  TrailerGenerateRequestSchema,
} from "@/lib/ai/trailer-generation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = TrailerGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  try {
    const result = await generateTrailerPrompt(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[marketing trailer generate-prompt] failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return apiError(E_TRAILER_GENERATION_FAILED, 500);
  }
}
