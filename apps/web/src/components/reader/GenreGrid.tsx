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
            onClick={() => onToggle(genre.id)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
              isSelected
                ? "border-[#907AFF] bg-[#907AFF]/10 text-slate-900 shadow-sm dark:border-[#B8A8FF] dark:bg-[#907AFF]/20 dark:text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/20 dark:hover:bg-white/10"
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
