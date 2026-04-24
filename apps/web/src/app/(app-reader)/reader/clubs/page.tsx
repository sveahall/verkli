import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import EmptyState from "@/components/reader/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { getBookClubsEnabled } from "@/lib/flags";
import ClubsPageClient from "./ClubsPageClient";

export type ClubRow = {
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

export default async function ClubsPage() {
  if (!getBookClubsEnabled()) {
    return (
      <div className="section-gap">
        <PageHeader
          eyebrow="Community"
          title="Book clubs"
          description="Read together with other readers."
        />
        <EmptyState
          title="Book clubs are not available yet"
          description="We're still rolling clubs out. Check back soon."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: publicClubs } = await supabase
    .from("book_clubs" as never)
    .select("id, name, description, cover_url, is_public, max_members, current_book_id, creator_id, created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: memberships } = await supabase
    .from("book_club_members" as never)
    .select("club_id, role")
    .eq("user_id", user.id);

  const memberClubIds = new Set(
    (memberships as { club_id: string; role: string }[] | null)?.map(
      (m) => m.club_id
    ) ?? []
  );

  let privateClubs: ClubRow[] = [];
  const privateClubIds = [...memberClubIds].filter(
    (id) => !(publicClubs as ClubRow[] | null)?.some((c) => c.id === id)
  );
  if (privateClubIds.length > 0) {
    const { data } = await supabase
      .from("book_clubs" as never)
      .select("id, name, description, cover_url, is_public, max_members, current_book_id, creator_id, created_at")
      .in("id", privateClubIds);
    privateClubs = (data as ClubRow[] | null) ?? [];
  }

  const allClubs = [...((publicClubs as ClubRow[] | null) ?? []), ...privateClubs];
  const uniqueClubs = [...new Map(allClubs.map((c) => [c.id, c])).values()];

  const { data: allMembers } = await supabase
    .from("book_club_members" as never)
    .select("club_id")
    .in(
      "club_id",
      uniqueClubs.map((c) => c.id)
    );

  const memberCounts: Record<string, number> = {};
  for (const row of (allMembers as { club_id: string }[] | null) ?? []) {
    memberCounts[row.club_id] = (memberCounts[row.club_id] ?? 0) + 1;
  }

  const clubsWithMeta = uniqueClubs.map((club) => ({
    ...club,
    memberCount: memberCounts[club.id] ?? 0,
    isMember: memberClubIds.has(club.id),
  }));

  return <ClubsPageClient clubs={clubsWithMeta} />;
}
