import type { Json } from "@/lib/supabase/types";

/**
 * Narrow a jsonb column to a JSON object, at runtime.
 *
 * A `Json` value is legitimately a string, a number, `null` or an array, so
 * spreading one into an object is only safe after checking. Before the clients
 * were typed this was written as `value as Record<string, unknown>` at each
 * call site — which compiled for any shape, so a column holding `"pending"` or
 * `[]` spread into nothing and the surrounding logic silently saw an empty
 * object instead of failing.
 *
 * Returns `{}` for anything that is not a plain object, which is what the old
 * `?? {}` fallbacks intended.
 */
export function asJsonObject(value: Json | null | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  // A Json object's values are `Json | undefined`; undefined only arises from
  // optional properties, which a parsed jsonb column does not have.
  return value as Record<string, Json>;
}
