import { z } from "zod";
import { parsePronunciationSnapshot, pronunciationRulesSchema, type PronunciationRule, type PronunciationScope } from "./pronunciation";

/** Disconnected contract only. No production route, storage implementation or flag is wired. */
export type PronunciationStore = {
  read(scope: PronunciationScope): Promise<unknown>;
  /** Must atomically compare revision and replace rules within all three scope fields. */
  compareAndSwap(scope: PronunciationScope, expectedRevision: number, rules: PronunciationRule[]): Promise<unknown>;
};
export type PronunciationServiceDependencies = {
  authenticate(request: Request): Promise<{ ownerId: string } | null>;
  /** Must verify the authenticated owner owns this book AND this edition belongs to it. */
  ownsEdition(scope: PronunciationScope): Promise<boolean>;
  store: PronunciationStore;
  logError(message: string): void;
};
const routeSchema = z.object({ bookId: z.string().uuid(), editionId: z.string().uuid() }).strict();
const saveSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  rules: pronunciationRulesSchema,
}).strict();
const resultSchema = z.object({ kind: z.enum(["saved", "conflict"]), snapshot: z.unknown() }).strict();
function respond(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function failure(error: string, status: number) { return respond({ error }, status); }

export function createPronunciationHandler(dependencies: PronunciationServiceDependencies, options: { enableForLocalTests?: true } = {}) {
  return async (request: Request, route: unknown): Promise<Response> => {
    if (options.enableForLocalTests !== true) return failure("Pronunciation storage is not available.", 503);
    try {
      const identity = await dependencies.authenticate(request);
      if (!identity || !z.string().min(1).safeParse(identity.ownerId).success) return failure("Sign in to manage pronunciation.", 401);
      const parsedRoute = routeSchema.safeParse(route);
      if (!parsedRoute.success) return failure("Choose a valid book and edition.", 400);
      if (request.method !== "GET" && request.method !== "PUT") return failure("Use GET or PUT for pronunciation.", 405);
      const scope = { ...parsedRoute.data, ownerId: identity.ownerId };
      if (!await dependencies.ownsEdition(scope)) return failure("Book edition was not found.", 404);
      if (request.method === "GET") {
        return respond(parsePronunciationSnapshot(await dependencies.store.read(scope), scope), 200);
      }
      let body: unknown;
      try { body = await request.json(); } catch { return failure("Send a valid JSON pronunciation request.", 400); }
      const parsed = saveSchema.safeParse(body);
      if (!parsed.success) return failure("Provide a valid expected revision and up to 100 unique pronunciation rules; client scope fields are not accepted.", 400);
      const { expectedRevision, rules } = parsed.data;
      const result = resultSchema.parse(await dependencies.store.compareAndSwap(scope, expectedRevision, rules));
      const snapshot = parsePronunciationSnapshot(result.snapshot, scope);
      if (result.kind === "saved") {
        if (snapshot.revision !== expectedRevision + 1 || JSON.stringify(snapshot.rules) !== JSON.stringify(rules)) throw new Error("Invalid CAS result.");
        return respond({ kind: "saved", snapshot }, 200);
      }
      if (snapshot.revision === expectedRevision) throw new Error("Invalid CAS conflict.");
      return respond({ kind: "conflict", snapshot, error: "Pronunciation changed. Reload the latest rules before saving again." }, 409);
    } catch {
      // Never include exception objects, scope values, rules or manuscript text in logs.
      dependencies.logError("[audiobook pronunciation] request failed");
      return failure("Pronunciation could not be loaded or saved. Try again.", 503);
    }
  };
}
