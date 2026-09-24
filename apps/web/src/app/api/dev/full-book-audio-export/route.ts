import { createFullBookExportHandlers } from "@/lib/audiobook/full-book-export-handler";
import { createFullBookExportFixture, FULL_BOOK_FIXTURE_BOOK, FULL_BOOK_FIXTURE_SCENARIOS, type FullBookFixtureScenario } from "@/lib/audiobook/full-book-export-fixture";
export const runtime = "nodejs";
async function handle(request: Request, method: "GET" | "POST" | "DELETE") {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const url = new URL(request.url), scenario = url.searchParams.get("scenario") ?? "complete";
  if (!FULL_BOOK_FIXTURE_SCENARIOS.includes(scenario as FullBookFixtureScenario)) return new Response(null, { status: 400 });
  url.searchParams.delete("scenario");
  return createFullBookExportHandlers(createFullBookExportFixture(scenario as FullBookFixtureScenario))[method](new Request(url, request), { params: Promise.resolve({ id: FULL_BOOK_FIXTURE_BOOK }) });
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
export const DELETE = (request: Request) => handle(request, "DELETE");
