import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("genres")
    .select("id, slug, name_sv, name_en, icon, display_order")
    .order("display_order", { ascending: true })
    .order("name_sv", { ascending: true });

  if (error) {
    console.error("[genres.get] failed", { message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ genres: data ?? [] });
}
