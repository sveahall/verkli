import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function probe() {
  const c = createClient<Database>("https://x.supabase.co", "k");
  const { data } = await c.from("books").select("id, title").limit(1);
  const row = (data ?? [])[0];
  return row?.id;
}
