import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookClubsEnabled } from "@/lib/flags";
import BookClubDetail from "@/components/clubs/BookClubDetail";
import { loadMemberProfiles } from "@/lib/book-clubs/member-profiles";

type ClubDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  if (!getBookClubsEnabled()) {
    redirect("/reader/library");
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: club } = await supabase
    .from("book_clubs")
    .select("id, name, description, cover_url, is_public, max_members, current_book_id, creator_id, created_at")
    .eq("id", id)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as {
    id: string;
    name: string;
    description: string | null;
    cover_url: string | null;
    is_public: boolean;
    max_members: number;
    current_book_id: string | null;
    creator_id: string;
    created_at: string;
  };

  const { data: members } = await supabase
    .from("book_club_members")
    .select("user_id, role, joined_at")
    .eq("club_id", id);

  // The `profiles:user_id(...)` embed does not work here and never has:
  // book_club_members has exactly one foreign key, to book_clubs. PostgREST
  // answers PGRST200 ("Could not find a relationship between
  // 'book_club_members' and 'profiles'"), a 400 — so this query returned NO
  // MEMBERS AT ALL, not merely members without names. The `as RawMember[]`
  // cast made that invisible.
  //
  // Resolved with a second batched query instead of adding the missing foreign
  // key: profiles rows are created on signup, and a hard FK from membership to
  // profiles would make a club join fail for anyone whose profile row does not
  // exist yet.
  const memberRows = members ?? [];
  const memberProfiles = await loadMemberProfiles(
    supabase,
    memberRows.map((m) => m.user_id)
  );

  const typedMembers = memberRows.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: memberProfiles.get(m.user_id)?.display_name ?? null,
    avatar_url: memberProfiles.get(m.user_id)?.avatar_url ?? null,
  }));

  const { data: messages } = await supabase
    .from("book_club_messages")
    .select("id, user_id, content, created_at")
    .eq("club_id", id)
    .order("created_at", { ascending: true })
    .limit(50);

  const typedMessages = (messages as { id: string; user_id: string; content: string; created_at: string }[] | null) ?? [];

  return (
    <div className="section-gap">
      <BookClubDetail
        club={typedClub}
        members={typedMembers}
        currentUser={{ id: user.id }}
        initialMessages={typedMessages}
      />
    </div>
  );
}
