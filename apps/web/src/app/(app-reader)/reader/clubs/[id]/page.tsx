import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookClubsEnabled } from "@/lib/flags";
import BookClubDetail from "@/components/clubs/BookClubDetail";

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
    .from("book_clubs" as never)
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
    .from("book_club_members" as never)
    .select("user_id, role, joined_at")
    .eq("club_id", id);

  const typedMembers = (members as { user_id: string; role: string; joined_at: string }[] | null) ?? [];

  const { data: messages } = await supabase
    .from("book_club_messages" as never)
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
