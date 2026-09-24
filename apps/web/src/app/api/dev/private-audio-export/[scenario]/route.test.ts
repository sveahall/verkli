import { afterEach, describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audiobook/private-export-fixture", () => ({ PRIVATE_FIXTURE_BOOK: "book", PRIVATE_FIXTURE_SCENARIOS: ["complete"], createPrivateExportFixture: create }));
const handlers = vi.hoisted(() => ({ GET: vi.fn(async () => new Response("preview")), POST: vi.fn(async () => new Response("binary")) }));
vi.mock("@/lib/audiobook/private-export-handler", () => ({ createPrivateExportHandlers: () => handlers }));
const { GET, POST } = await import("./route");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("private export development fixture gate", () => {
  it.each(["production", "test"])("cannot run in %s", async (env) => { vi.stubEnv("NODE_ENV", env); const ctx = { params: Promise.resolve({ scenario: "complete" }) }; expect((await GET(new Request("http://localhost/test"), ctx)).status).toBe(404); expect((await POST(new Request("http://localhost/test"), ctx)).status).toBe(404); expect(create).not.toHaveBeenCalled(); });
  it("rejects unknown scenarios", async () => { vi.stubEnv("NODE_ENV", "development"); expect((await GET(new Request("http://localhost/test"), { params: Promise.resolve({ scenario: "unknown" }) })).status).toBe(404); expect(create).not.toHaveBeenCalled(); });
  it("uses only synthetic dependencies in development", async () => { vi.stubEnv("NODE_ENV", "development"); expect(await (await GET(new Request("http://localhost/test"), { params: Promise.resolve({ scenario: "complete" }) })).text()).toBe("preview"); expect(create).toHaveBeenCalledWith("complete"); });
});
