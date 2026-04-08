import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const { data: books } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", user.id);

  const bookIds = (books ?? []).map((b) => b.id as string);

  if (bookIds.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const { data: campaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, channel, status, created_at")
    .in("book_id", bookIds)
    .order("created_at", { ascending: false });

  return NextResponse.json({ campaigns: campaigns ?? [] });
}
