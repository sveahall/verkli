import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";
import { extractText } from "@/app/(app-author)/author/books/[id]/editor/bookEditor.shared";

/* ─────────────────────────────────────────────────────────────────
   Genre keyword map — keyed by partial slug match or exact slug.
   Values are lowercase keyword lists that strongly signal that genre.
   ───────────────────────────────────────────────────────────────── */
const GENRE_SIGNALS: Record<string, string[]> = {
  fantasy: [
    "magic", "wizard", "dragon", "elf", "dwarf", "enchanted", "realm",
    "sorcerer", "spell", "mystical", "mythical", "castle", "sword",
    "quest", "dungeon", "warlock", "fairy", "unicorn", "goblin", "troll",
  ],
  "sci-fi": [
    "space", "galaxy", "robot", "planet", "alien", "starship", "laser",
    "cyborg", "android", "dystopia", "utopia", "technology", "cyber",
    "future", "universe", "spacecraft", "warp", "quantum",
  ],
  romance: [
    "love", "heart", "kiss", "romance", "passion", "marriage", "wedding",
    "relationship", "feelings", "couple", "darling", "jealous",
    "attraction", "desire", "boyfriend", "girlfriend", "husband", "wife",
  ],
  mystery: [
    "murder", "detective", "clue", "crime", "investigation", "suspect",
    "poison", "alibi", "witness", "case", "corpse", "killer", "victim",
    "evidence", "inspector", "sleuth",
  ],
  thriller: [
    "spy", "assassin", "survival", "escape", "danger", "threat",
    "conspiracy", "kidnap", "hostage", "bomb", "agent", "terror",
    "chase", "ambush", "explosive", "mission",
  ],
  horror: [
    "ghost", "haunted", "monster", "demon", "vampire", "undead", "zombie",
    "nightmare", "fear", "dark", "scream", "blood", "curse", "evil",
    "phantom", "supernatural", "witch", "shadow",
  ],
  biography: [
    "memoir", "autobiography", "born", "childhood", "growing up",
    "life story", "my journey", "years of", "reminisce",
  ],
  "non-fiction": [
    "history", "research", "study", "analysis", "report",
    "documentary", "evidence", "policy", "economy", "philosophy",
  ],
  fiction: ["novel", "story", "fiction", "tale", "narrative"],
  adventure: [
    "adventure", "expedition", "journey", "voyage", "treasure", "jungle",
    "pirate", "explorer", "map", "island", "mountain", "survival",
  ],
  historical: [
    "century", "era", "empire", "dynasty", "war", "ancient", "medieval",
    "kingdom", "revolution", "historical", "period", "chronicle",
  ],
  "young-adult": [
    "teenage", "teen", "high school", "college", "coming of age",
    "young adult", "youth", "graduation",
  ],
  "children": [
    "children", "kids", "young readers", "picture book", "fairy tale",
    "animal friends", "school bus",
  ],
};

function scoreGenreSlug(slug: string, text: string): number {
  const lower = text.toLowerCase();
  // Find matching signal list by partial key match
  const matchingKey = Object.keys(GENRE_SIGNALS).find(
    (k) => slug.includes(k) || k.includes(slug)
  );
  if (!matchingKey) {
    // Fall back to just checking if the slug word itself appears
    return lower.includes(slug.replace(/-/g, " ")) ? 1 : 0;
  }
  const keywords = GENRE_SIGNALS[matchingKey];
  return keywords.reduce((score, kw) => {
    // Count occurrences (simple)
    let count = 0;
    let pos = lower.indexOf(kw);
    while (pos !== -1) {
      count++;
      pos = lower.indexOf(kw, pos + 1);
    }
    return score + count;
  }, 0);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  // Verify ownership
  const { data: book } = await supabase
    .from("books")
    .select("author_id, title, description, language")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== user.id) return apiError(E_BOOK_NOT_FOUND, 404);

  // Fetch first chapter content for richer signal
  const { data: versionRow } = await supabase
    .from("book_versions")
    .select("id")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let sampleText = `${book.title ?? ""} ${book.description ?? ""}`;

  if (versionRow) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("content")
      .eq("book_version_id", versionRow.id)
      .order("order", { ascending: true })
      .limit(3); // first 3 chapters for signal

    for (const ch of chapters ?? []) {
      if (ch.content) {
        try {
          const parsed = JSON.parse(ch.content);
          sampleText += ` ${extractText(parsed)}`;
        } catch {
          sampleText += ` ${ch.content}`;
        }
      }
    }
  }

  // Fetch all genres
  const { data: allGenres, error: genreErr } = await supabase
    .from("genres")
    .select("id, slug, name_en")
    .order("display_order", { ascending: true });

  if (genreErr) return apiError(E_DATABASE_ERROR, 500);

  // Score each genre
  const scored = (allGenres ?? [])
    .map((g) => ({
      id: g.id,
      score: scoreGenreSlug(g.slug ?? g.name_en?.toLowerCase() ?? "", sampleText),
    }))
    .filter((g) => g.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return NextResponse.json({ genreIds: scored.map((g) => g.id) });
}
