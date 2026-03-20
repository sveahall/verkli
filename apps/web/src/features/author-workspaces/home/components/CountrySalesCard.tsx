type CountrySalesItem = {
  country: string;
  share: string;
};

type CountrySalesCardProps = {
  items: CountrySalesItem[];
};

function WorldMapPlaceholder() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 190"
      className="h-full w-full text-[#4168C8]"
      fill="none"
    >
      <defs>
        <pattern
          id="dashboard-world-dots"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2.5" cy="2.5" r="2.1" fill="currentColor" />
        </pattern>
      </defs>

      <path
        d="M35 61c12-13 25-17 42-18l17-13 30 4 11 17 22 4-10 16-20 4-16 31-21 18-18-10-7-27-12-8-7-18-11-7Z"
        fill="url(#dashboard-world-dots)"
      />
      <path
        d="m118 117 17 10 9 22-8 24-10 15-10-8-1-19 3-26Z"
        fill="url(#dashboard-world-dots)"
      />
      <path
        d="m192 45 24-8 27 7 22-4 18 11-11 11 10 16-14 8-5 18-18 18-16 1-9 25-20 18-15-10 4-27-11-22 5-20-9-16 8-18Z"
        fill="url(#dashboard-world-dots)"
      />
      <path
        d="m282 35 22-7 33 16 12 28-8 19-10 11-15-3-14 16-11 23-18-9-2-24 7-15-8-14 5-16-12-12Z"
        fill="url(#dashboard-world-dots)"
      />
      <path
        d="m309 136 18-3 13 8 6 20-11 17-22-4-5-24Z"
        fill="url(#dashboard-world-dots)"
      />
    </svg>
  );
}

export default function CountrySalesCard({ items }: CountrySalesCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Sales by country</h2>

      <div className="mt-5 flex items-start justify-between gap-6">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.country}
              className="flex items-center justify-between gap-6 text-sm text-slate-700"
            >
              <span className="inline-flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-purple-500"
                />
                {item.country}
              </span>
              <span className="font-medium text-[#7C6CFF]">{item.share}</span>
            </li>
          ))}
        </ul>

        <div className="hidden min-h-[160px] flex-1 lg:block">
          <WorldMapPlaceholder />
        </div>
      </div>
    </section>
  );
}
