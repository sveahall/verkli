"use client";

interface Genre {
  id: string;
  slug: string;
  name_sv: string;
  name_en: string;
  icon: string | null;
  display_order: number;
}

interface GenreGridProps {
  genres: Genre[];
  selected: Set<string>;
  onToggle: (genreId: string) => void;
}

export default function GenreGrid({ genres, selected, onToggle }: GenreGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {genres.map((genre) => {
        const isSelected = selected.has(genre.id);
        return (
          <button
            key={genre.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(genre.id)}
            className={`flex items-center gap-3 rounded-2xl min-h-14 border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-[background-color,border-color,color,box-shadow] ${
              isSelected
                ? "border-[#907AFF] bg-[#907AFF]/10 text-foreground shadow-sm dark:border-[#B8A8FF] dark:bg-[#907AFF]/20 "
                : "border-border bg-card text-foreground hover:border-border hover:bg-muted dark:hover:border-border dark:hover:bg-card"
            }`}
          >
            {genre.icon && <span className="text-xl">{genre.icon}</span>}
            <span className="text-[14px] font-medium">{genre.name_sv}</span>
          </button>
        );
      })}
    </div>
  );
}
