import { z } from "zod";
import type { Json } from "@/lib/supabase/types";

/**
 * A Zod schema whose output type is exactly Supabase's `Json`.
 *
 * `z.record(z.unknown())` — which several request schemas used — produces
 * `Record<string, unknown>`, and `unknown` is not assignable to `Json`. Writing
 * one of those into a jsonb column therefore needs a cast at every call site,
 * and a cast at the call site is indistinguishable from a cast that is hiding a
 * real mismatch. This validates the shape instead, so the type is earned rather
 * than asserted.
 *
 * `z.lazy` is required because the type is recursive; the explicit
 * `z.ZodType<Json>` annotation is required because TypeScript cannot infer a
 * recursive schema's output on its own.
 */
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ])
);

/** A JSON object, for the common case of a metadata/config blob. */
export const jsonObjectSchema: z.ZodType<Record<string, Json>> = z.record(jsonSchema);
