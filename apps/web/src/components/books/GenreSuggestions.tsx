"use client";

import { useMemo } from "react";

type Props = {
  bookTitle: string;
  bookContent?: string;
  onSelectGenre: (genre: string) => void;
};

const GENRE_KEYWORDS: Record<string, string[]> = {
  Fantasy: ["magic", "dragon", "wizard", "elf", "quest", "kingdom", "sword", "magi", "drake", "trollkarl"],
  "Sci-Fi": ["space", "robot", "alien", "future", "galaxy", "planet", "rymd", "robot", "framtid"],
  Romance: ["love", "heart", "kiss", "passion", "romance", "k\u00e4rlek", "hj\u00e4rta", "kyss"],
  Mystery: ["detective", "clue", "murder", "suspect", "mystery", "mysterium", "mord", "detektiv"],
  Thriller: ["chase", "danger", "suspense", "escape", "thriller", "fara", "flykt", "sp\u00e4nning"],
  Horror: ["ghost", "dark", "fear", "haunted", "horror", "sp\u00f6ke", "m\u00f6rker", "r\u00e4dsla"],
  Biography: ["life", "born", "memoir", "autobiography", "biografi", "liv", "memoar"],
  "Self-Help": ["growth", "mindset", "habit", "goal", "motivation", "sj\u00e4lvhj\u00e4lp", "m\u00e5l"],
  History: ["war", "century", "empire", "revolution", "history", "historia", "krig", "revolution"],
  Poetry: ["poem", "verse", "stanza", "rhyme", "poesi", "dikt", "vers"],
  Drama: ["conflict", "family", "tragedy", "relationship", "drama", "familj", "konflikt"],
  Children: ["adventure", "friend", "animal", "magic", "barn", "\u00e4ventyr", "v\u00e4n", "djur"],
  "Young Adult": ["school", "teen", "coming of age", "identity", "ungdom", "skola", "identitet"],
  Fiction: ["story", "novel", "character", "narrative", "ber\u00e4ttelse", "roman", "karakt\u00e4r"],
  "Non-Fiction": ["fact", "research", "study", "analysis", "fakta", "forskning", "analys"],
  Comics: ["comic", "graphic", "panel", "hero", "serie", "grafisk"],
};

export default function GenreSuggestions({ bookTitle, bookContent, onSelectGenre }: Props) {
  const suggestions = useMemo(() => {
    const text = `${bookTitle} ${bookContent ?? ""}`.toLowerCase();
    const scored: { genre: string; score: number }[] = [];

    for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score += 1;
      }
      if (score > 0) {
        scored.push({ genre, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map((s) => s.genre);
  }, [bookTitle, bookContent]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((genre) => (
        <button
          key={genre}
          type="button"
          onClick={() => onSelectGenre(genre)}
          className="rounded-full bg-slate-100 px-3 py-1 text-[13px] text-slate-700 transition hover:bg-[#907AFF]/10 hover:text-[#907AFF] dark:bg-white/10 dark:text-white/70 dark:hover:bg-[#907AFF]/10 dark:hover:text-[#907AFF]"
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
