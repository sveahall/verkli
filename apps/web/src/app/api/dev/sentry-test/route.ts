import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Dev-only Sentry smoke test. Hitting this endpoint:
//   1. Captures an explicit message via `Sentry.captureMessage`.
//   2. Throws a deliberate error so `instrumentation.ts#onRequestError` /
//      `Sentry.captureRequestError` reports it via the Next.js hook.
//
// Guarded by NODE_ENV !== "production" — cannot be reached on a live
// deployment. To verify the client-side pipeline, append `?mode=client-trigger`
// to read instructions on how to trigger from the browser.

export const dynamic = "force-dynamic";

function isAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: Request) {
  if (!isAllowed()) {
    return NextResponse.json(
      { ok: false, reason: "disabled" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "throw";

  if (mode === "message") {
    Sentry.captureMessage("sentry-test: server captureMessage smoke test", {
      level: "info",
      tags: { source: "sprint0-smoke-test" },
    });
    return NextResponse.json({
      ok: true,
      mode,
      note: "captureMessage sent. Check Sentry for 'sentry-test: server captureMessage smoke test'.",
    });
  }

  if (mode === "client-trigger") {
    return NextResponse.json({
      ok: true,
      mode,
      note: "Open the browser console on any page and run: throw new Error('sentry-test: client smoke test'); — instrumentation-client.ts will report it.",
    });
  }

  // Default: throw, so onRequestError reports it.
  Sentry.captureMessage("sentry-test: about to throw", {
    level: "warning",
    tags: { source: "sprint0-smoke-test" },
  });
  throw new Error("sentry-test: deliberate Sprint 0 smoke-test error");
}
