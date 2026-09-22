import { describe, expect, it, vi } from "vitest";
import type { PronunciationRule, PronunciationScope } from "./pronunciation";
import { createPronunciationHandler, type PronunciationServiceDependencies } from "./pronunciation-service";

const scope = { ownerId: "author", bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222" };
const route = { bookId: scope.bookId, editionId: scope.editionId };
const rules = [{ word: "Mira", spokenAs: "Mee-ra" }];
function fixture() {
  let stored = { scope: { ...scope }, revision: 1, rules: rules.map((rule) => ({ ...rule })) };
  const dependencies = {
    authenticate: vi.fn(async (): Promise<{ ownerId: string } | null> => ({ ownerId: scope.ownerId })),
    ownsEdition: vi.fn(async () => true),
    store: {
      read: vi.fn(async () => stored),
      compareAndSwap: vi.fn(async (_scope: PronunciationScope, expectedRevision: number, nextRules: PronunciationRule[]) => {
        if (stored.revision !== expectedRevision) return { kind: "conflict", snapshot: stored };
        stored = { scope: { ...scope }, revision: expectedRevision + 1, rules: nextRules };
        return { kind: "saved", snapshot: stored };
      }),
    },
    logError: vi.fn(),
  } satisfies PronunciationServiceDependencies;
  return { dependencies, handler: createPronunciationHandler(dependencies, { enableForLocalTests: true }) };
}
function request(body?: unknown) {
  return new Request("https://local.test/pronunciation", body === undefined ? undefined : { method: "PUT", body: JSON.stringify(body) });
}

describe("disconnected pronunciation service", () => {
  it("defaults to unavailable without calling any dependency", async () => {
    const { dependencies } = fixture();
    const response = await createPronunciationHandler(dependencies)(request(), route);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const fn of [dependencies.authenticate, dependencies.ownsEdition, dependencies.store.read, dependencies.store.compareAndSwap, dependencies.logError]) expect(fn).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests before ownership or storage", async () => {
    const { dependencies, handler } = fixture();
    dependencies.authenticate.mockResolvedValueOnce(null);
    expect((await handler(request(), route)).status).toBe(401);
    expect(dependencies.ownsEdition).not.toHaveBeenCalled();
    expect(dependencies.store.read).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT"])("checks the complete authenticated scope before %s storage", async (method) => {
    const { dependencies, handler } = fixture();
    dependencies.ownsEdition.mockResolvedValueOnce(false);
    const otherRoute = { ...route, editionId: "33333333-3333-4333-8333-333333333333" };
    const response = await handler(method === "GET" ? request() : request({ expectedRevision: 1, rules }), otherRoute);
    expect(response.status).toBe(404);
    expect(dependencies.ownsEdition).toHaveBeenCalledWith({ ...scope, editionId: otherRoute.editionId });
    expect(dependencies.store.read).not.toHaveBeenCalled();
    expect(dependencies.store.compareAndSwap).not.toHaveBeenCalled();
  });
  it.each(["bookId", "editionId"])("rejects malformed route %s before storage", async (key) => {
    const { dependencies, handler } = fixture();
    expect((await handler(request(), { ...route, [key]: "invalid" })).status).toBe(400);
    expect(dependencies.ownsEdition).not.toHaveBeenCalled();
    expect(dependencies.store.read).not.toHaveBeenCalled();
  });
  it("loads only the authenticated owner's snapshot with no-store", async () => {
    const { dependencies, handler } = fixture();
    const response = await handler(request(), route);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scope, revision: 1, rules });
    expect(dependencies.store.read).toHaveBeenCalledWith(scope);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("uses one atomic CAS and preserves the latest snapshot on stale saves", async () => {
    const { dependencies, handler } = fixture();
    const first = await handler(request({ expectedRevision: 1, rules: [] }), route);
    expect(first.status).toBe(200);
    const stale = await handler(request({ expectedRevision: 1, rules }), route);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ kind: "conflict", snapshot: { scope, revision: 2, rules: [] } });
    expect(dependencies.store.read).not.toHaveBeenCalled();
    expect(dependencies.store.compareAndSwap).toHaveBeenNthCalledWith(1, scope, 1, []);
  });
  it.each([
    { expectedRevision: 1, rules, ownerId: "victim" },
    { expectedRevision: 1, rules, editionId: scope.editionId },
    { expectedRevision: -1, rules }, { expectedRevision: 1.1, rules },
    { expectedRevision: Number.MAX_SAFE_INTEGER, rules },
    { expectedRevision: 1, rules: [{ word: "", spokenAs: "bad" }] },
    { expectedRevision: 1, rules: [...rules, ...rules] },
    { expectedRevision: 1, rules: [{ word: "Mira", spokenAs: "x".repeat(201) }] },
    { expectedRevision: 1, rules: Array.from({ length: 101 }, (_, i) => ({ word: String(i), spokenAs: "x" })) },
  ])("rejects malformed or client-scoped save bodies", async (body) => {
    const { dependencies, handler } = fixture();
    expect((await handler(request(body), route)).status).toBe(400);
    expect(dependencies.store.compareAndSwap).not.toHaveBeenCalled();
  });
  it("returns a useful error for invalid JSON", async () => {
    const { handler } = fixture();
    expect((await handler(new Request("https://local.test", { method: "PUT", body: "{" }), route)).status).toBe(400);
  });
  it.each(["ownerId", "bookId", "editionId"])("fails closed on a cross-scope read %s", async (key) => {
    const { dependencies, handler } = fixture();
    dependencies.store.read.mockResolvedValueOnce({ scope: { ...scope, [key]: "other" }, revision: 1, rules });
    expect((await handler(request(), route)).status).toBe(503);
  });
  it.each(["ownerId", "bookId", "editionId"])("fails closed on a cross-scope CAS %s", async (key) => {
    const { dependencies, handler } = fixture();
    dependencies.store.compareAndSwap.mockResolvedValueOnce({ kind: "saved", snapshot: { scope: { ...scope, [key]: "other" }, revision: 2, rules } });
    const response = await handler(request({ expectedRevision: 1, rules }), route);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("other");
  });
  it("rejects successful CAS responses that did not store the submitted rules", async () => {
    const { dependencies, handler } = fixture();
    dependencies.store.compareAndSwap.mockResolvedValueOnce({ kind: "saved", snapshot: { scope, revision: 2, rules: [] } });
    expect((await handler(request({ expectedRevision: 1, rules }), route)).status).toBe(503);
  });
  it("rejects conflict responses at the submitted revision", async () => {
    const { dependencies, handler } = fixture();
    dependencies.store.compareAndSwap.mockResolvedValueOnce({ kind: "conflict", snapshot: { scope, revision: 1, rules } });
    expect((await handler(request({ expectedRevision: 1, rules }), route)).status).toBe(503);
  });
  it("fails closed on a malformed CAS response without logging private data", async () => {
    const { dependencies, handler } = fixture();
    dependencies.store.compareAndSwap.mockResolvedValueOnce({ kind: "saved", snapshot: { scope, revision: 1, rules } });
    expect((await handler(request({ expectedRevision: 1, rules }), route)).status).toBe(503);
    dependencies.store.read.mockRejectedValueOnce(new Error("private manuscript and owner data"));
    const response = await handler(request(), route);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
    expect(dependencies.logError.mock.calls).toEqual([["[audiobook pronunciation] request failed"], ["[audiobook pronunciation] request failed"]]);
  });
});
