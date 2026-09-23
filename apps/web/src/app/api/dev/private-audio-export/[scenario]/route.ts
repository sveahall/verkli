import { createPrivateExportHandlers } from "@/lib/audiobook/private-export-handler";
import { PRIVATE_FIXTURE_BOOK, PRIVATE_FIXTURE_SCENARIOS, createPrivateExportFixture, type PrivateFixtureScenario } from "@/lib/audiobook/private-export-fixture";
export const runtime = "nodejs";
type Context = { params: Promise<{ scenario: string }> };
async function run(request: Request, context: Context, method: "GET" | "POST") {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found." }, { status: 404 });
  const { scenario } = await context.params;
  if (!PRIVATE_FIXTURE_SCENARIOS.includes(scenario as PrivateFixtureScenario)) return Response.json({ error: "Not found." }, { status: 404 });
  const handlers = createPrivateExportHandlers(createPrivateExportFixture(scenario as PrivateFixtureScenario));
  return handlers[method](request, { params: Promise.resolve({ id: PRIVATE_FIXTURE_BOOK }) });
}
export const GET = (request: Request, context: Context) => run(request, context, "GET");
export const POST = (request: Request, context: Context) => run(request, context, "POST");
