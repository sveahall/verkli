"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WORLD_DOTS } from "./world-map-paths";

type CountrySalesItem = {
  country: string;
  share: string;
};

type CountrySalesCardProps = {
  items: CountrySalesItem[];
};

/* Country display-name → ISO alpha-2 */
const NAME_TO_ALPHA2: Record<string, string> = {
  Poland: "PL", Schweiz: "CH", Switzerland: "CH", Sweden: "SE",
  France: "FR", Italy: "IT", Germany: "DE", Spain: "ES",
  Norway: "NO", Finland: "FI", Denmark: "DK",
  "United Kingdom": "GB", UK: "GB", Ireland: "IE", Portugal: "PT",
  Austria: "AT", "Czech Republic": "CZ", Czechia: "CZ",
  Netherlands: "NL", Belgium: "BE", Romania: "RO", Hungary: "HU",
  Greece: "GR", Ukraine: "UA", Croatia: "HR", Serbia: "RS",
  Slovakia: "SK", USA: "US", "United States": "US",
  Brazil: "BR", Japan: "JP", Australia: "AU", Canada: "CA",
  China: "CN", India: "IN", Mexico: "MX", Russia: "RU",
};

/* ISO 3166-1 numeric → alpha-2 (world-atlas feature IDs) */
const NUM_TO_ALPHA2: Record<string, string> = {
  "040": "AT", "056": "BE", "100": "BG", "191": "HR", "196": "CY",
  "203": "CZ", "208": "DK", "233": "EE", "246": "FI", "250": "FR",
  "276": "DE", "300": "GR", "348": "HU", "352": "IS", "372": "IE",
  "380": "IT", "428": "LV", "440": "LT", "442": "LU", "470": "MT",
  "528": "NL", "578": "NO", "616": "PL", "620": "PT", "642": "RO",
  "643": "RU", "688": "RS", "703": "SK", "705": "SI", "724": "ES",
  "752": "SE", "756": "CH", "804": "UA", "826": "GB",
  "840": "US", "124": "CA", "484": "MX", "076": "BR", "032": "AR",
  "152": "CL", "170": "CO", "604": "PE",
  "156": "CN", "392": "JP", "410": "KR", "356": "IN", "360": "ID",
  "764": "TH", "704": "VN", "608": "PH", "458": "MY",
  "036": "AU", "554": "NZ",
  "818": "EG", "710": "ZA", "566": "NG", "404": "KE", "504": "MA",
  "012": "DZ", "788": "TN",
};

/* ── Colour helpers ─────────────────────────────────────────────── */
const BRAND_R = 144;
const BRAND_G = 122;
const BRAND_B = 255;
const BASE_DOT_LIGHT = "#C8C1E8";
const BASE_DOT_DARK = "#3D3660";

function violet(t: number): string {
  const r = Math.round(255 - (255 - BRAND_R) * t);
  const g = Math.round(255 - (255 - BRAND_G) * t);
  const b = Math.round(255 - (255 - BRAND_B) * t);
  return `rgb(${r},${g},${b})`;
}

const DOT_R = 2.8;
const VB_W = 800;
const VB_H = 420;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function isDarkSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function subscribeDark(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function useIsDark() {
  return useSyncExternalStore(subscribeDark, isDarkSnapshot, () => false);
}

const CURSOR_GRAB = { cursor: "grab" } as const;
const CURSOR_ZOOM = { cursor: "zoom-in" } as const;

/* ── Interactive dotted world map ─────────────────────────────────── */
function WorldMap({ items }: { items: CountrySalesItem[] }) {
  const isDark = useIsDark();
  const baseDot = isDark ? BASE_DOT_DARK : BASE_DOT_LIGHT;
  const salesByAlpha2 = new Map<string, number>();
  let maxVal = 0;
  for (const item of items) {
    // Support both country codes (SE) and display names (Sweden)
    const code = NAME_TO_ALPHA2[item.country] ?? item.country;
    const val = parseInt(item.share, 10);
    if (code && !isNaN(val)) {
      salesByAlpha2.set(code, val);
      if (val > maxVal) maxVal = val;
    }
  }

  /* zoom / pan state */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      const maxPanX = ((z - 1) * VB_W) / 2;
      const maxPanY = ((z - 1) * VB_H) / 2;
      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, px)),
        y: Math.max(-maxPanY, Math.min(maxPanY, py)),
      };
    },
    [],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom - e.deltaY * 0.002));
      setZoom(next);
      setPan((p) => clampPan(p.x, p.y, next));
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [zoom, clampPan]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (zoom <= 1) return;
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [zoom, pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = VB_W / rect.width;
      const scaleY = VB_H / rect.height;
      const dx = (e.clientX - dragStart.current.x) * scaleX;
      const dy = (e.clientY - dragStart.current.y) * scaleY;
      setPan(clampPan(panStart.current.x + dx, panStart.current.y + dy, zoom));
    },
    [zoom, clampPan],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /* viewBox derived from zoom + pan */
  const vbW = VB_W / zoom;
  const vbH = VB_H / zoom;
  const vbX = (VB_W - vbW) / 2 - pan.x / zoom;
  const vbY = (VB_H - vbH) / 2 - pan.y / zoom;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={zoom > 1 ? CURSOR_GRAB : CURSOR_ZOOM}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="h-full w-full"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {WORLD_DOTS.map((dot, i) => {
          const alpha2 = NUM_TO_ALPHA2[dot.id];
          const share = alpha2 ? salesByAlpha2.get(alpha2) : undefined;
          const fill =
            share !== undefined
              ? violet(0.5 + (share / Math.max(maxVal, 1)) * 0.5)
              : baseDot;
          return (
            <circle key={i} cx={dot.x} cy={dot.y} r={DOT_R} fill={fill} />
          );
        })}
      </svg>

      {zoom > 1 && (
        <button
          type="button"
          onClick={handleReset}
          className="absolute bottom-2 right-2 rounded-lg bg-white/80 px-2 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur transition hover:text-slate-700 dark:bg-white/10 dark:text-white/60 dark:ring-white/10 dark:hover:text-white"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/* ── Country code → display name ─────────────────────────────────── */
const ALPHA2_TO_NAME: Record<string, string> = {
  PL: "Poland", CH: "Switzerland", SE: "Sweden", FR: "France", IT: "Italy",
  DE: "Germany", ES: "Spain", NO: "Norway", FI: "Finland", DK: "Denmark",
  GB: "United Kingdom", IE: "Ireland", PT: "Portugal", AT: "Austria",
  CZ: "Czechia", NL: "Netherlands", BE: "Belgium", RO: "Romania",
  HU: "Hungary", GR: "Greece", UA: "Ukraine", HR: "Croatia", RS: "Serbia",
  SK: "Slovakia", US: "United States", BR: "Brazil", JP: "Japan",
  AU: "Australia", CA: "Canada", CN: "China", IN: "India", MX: "Mexico",
  RU: "Russia",
};

function displayCountryName(code: string): string {
  return ALPHA2_TO_NAME[code] ?? code;
}

/* ── Main card ──────────────────────────────────────────────────── */
export default function CountrySalesCard({ items }: CountrySalesCardProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] sm:px-7 sm:py-5 dark:bg-white/[0.04]">
        <h2 className="text-xl font-normal text-slate-900 dark:text-white">Sales by country</h2>
        <div className="mt-4 flex items-center justify-between gap-6">
          <p className="text-sm text-slate-400 dark:text-white/40">
            Inga försäljningar ännu.
          </p>
          <div className="hidden min-h-[200px] flex-1 lg:block">
            <WorldMap items={[]} />
          </div>
        </div>
      </section>
    );
  }

  const maxVal = Math.max(
    ...items.map((it) => parseInt(it.share, 10)).filter((n) => !isNaN(n)),
    1,
  );

  return (
    <section className="rounded-2xl bg-white px-7 py-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:bg-white/[0.04]">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sales by country</h2>

      <div className="mt-4 flex items-start justify-between gap-6">
        <ul className="flex shrink-0 flex-col gap-2.5 pt-1">
          {items.map((item) => {
            const val = parseInt(item.share, 10);
            const t = isNaN(val) ? 0.5 : 0.5 + (val / maxVal) * 0.5;
            const color = violet(t);
            return (
              <li
                key={item.country}
                className="flex items-center justify-between gap-6 text-sm text-slate-700 dark:text-white/70"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {displayCountryName(item.country)}
                </span>
                <span className="font-medium" style={{ color }}>
                  {item.share}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="hidden min-h-[200px] flex-1 lg:block">
          <WorldMap items={items} />
        </div>
      </div>
    </section>
  );
}
