/**
 * Generate the 4 pre-baked fallback covers for the investor pitch.
 *
 * BACKGROUND: Day 5 originally specced these as NVIDIA SD3 outputs so the
 * fallback would be pixel-consistent with live cover-gen. The NVIDIA
 * endpoint started returning 404 during Day 5 prep, and no alternative
 * image-gen API keys are configured in this environment. We fall back to
 * pure-SVG covers — brand-on, deterministic, zero external dependency,
 * and they have the same 2:3 vertical aspect as SD3 output so the
 * transition between live-gen and fallback in the UI is seamless.
 *
 * Output: apps/web/public/demo-assets/covers/0[1-4].svg
 *
 * Idempotent: regenerates files on every run.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const OUT_DIR = path.join(PUBLIC_DIR, "demo-assets", "covers");

// Brand tokens (mirror DESIGN.md). Hard-coded because this script runs in
// plain Node without the Tailwind CSS layer.
// BRAND_VIOLET intentionally omitted — these covers lean warm/parchment;
// the violet accent reappears in the candlelight glow gradient via amber+rose.
const BRAND_ROSE = "#E29ED5";
const BRAND_AMBER = "#FCC997";
const PAPER = "#FDF8EE";
const PARCHMENT = "#E8DBC1";
const INK = "#0E0B1A";
const LEATHER_DARK = "#3A1F0F";
const LEATHER_MID = "#6B3D1F";
const GOLD = "#D4A55D";

// Match the SD3 production output ratio (aspect_ratio: "2:3" = 1024×1536-ish).
const W = 1024;
const H = 1536;

interface CoverVariant {
  filename: string;
  /** One-line label noted in README + alt text. */
  description: string;
  /** SVG inner content drawn over the full WxH viewBox. */
  render: () => string;
}

function svgWrap(inner: string, alt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${alt}">
${inner}
</svg>
`;
}

// ─── Variant 1 — leather-bound antique journal ────────────────────────────
function variantLeather(): string {
  const inner = `
  <defs>
    <linearGradient id="leatherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${LEATHER_MID}"/>
      <stop offset="60%" stop-color="${LEATHER_DARK}"/>
      <stop offset="100%" stop-color="#1d0e07"/>
    </linearGradient>
    <radialGradient id="leatherShade" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#9a5a31" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${LEATHER_DARK}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="leatherTexture" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${LEATHER_DARK}" fill-opacity="0"/>
      <circle cx="3" cy="3" r="0.8" fill="#1a0d05" fill-opacity="0.45"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#leatherGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#leatherShade)"/>
  <rect width="${W}" height="${H}" fill="url(#leatherTexture)"/>
  <!-- gold double-frame -->
  <rect x="64" y="80" width="${W - 128}" height="${H - 160}" fill="none" stroke="${GOLD}" stroke-width="3" stroke-opacity="0.85"/>
  <rect x="80" y="96" width="${W - 160}" height="${H - 192}" fill="none" stroke="${GOLD}" stroke-width="1.5" stroke-opacity="0.55"/>
  <!-- corner ornaments -->
  ${corners(GOLD)}
  <!-- center crest: keyhole -->
  <g transform="translate(${W / 2}, ${H * 0.42})">
    <circle r="120" fill="none" stroke="${GOLD}" stroke-width="2" stroke-opacity="0.7"/>
    <circle r="80" fill="none" stroke="${GOLD}" stroke-width="1.2" stroke-opacity="0.55"/>
    <path d="M-22 -30 a22 22 0 0 1 44 0 v60 h-44 z" fill="${GOLD}" fill-opacity="0.85"/>
    <circle cy="-12" r="14" fill="${LEATHER_DARK}"/>
  </g>
  <!-- spine shadow -->
  <rect x="0" y="0" width="120" height="${H}" fill="black" fill-opacity="0.35"/>
  <rect x="0" y="0" width="40" height="${H}" fill="black" fill-opacity="0.55"/>
`;
  return svgWrap(inner, "Leather-bound antique journal — gothic gold-embossed cover");
}

// ─── Variant 2 — aged parchment with ink ──────────────────────────────────
function variantParchment(): string {
  const inner = `
  <defs>
    <radialGradient id="parchGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#f3e3c2"/>
      <stop offset="60%" stop-color="${PARCHMENT}"/>
      <stop offset="100%" stop-color="#a08660"/>
    </radialGradient>
    <pattern id="parchSpeckles" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="6" r="0.7" fill="#6e4f2b" fill-opacity="0.18"/>
      <circle cx="9" cy="2" r="0.5" fill="#6e4f2b" fill-opacity="0.12"/>
      <circle cx="11" cy="11" r="0.9" fill="#6e4f2b" fill-opacity="0.22"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#parchGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#parchSpeckles)"/>
  <!-- torn vignette edges -->
  <path d="M0 0 Q ${W / 2} 40 ${W} 0 L ${W} 80 Q ${W / 2} 30 0 80 Z" fill="#7c5a32" fill-opacity="0.35"/>
  <path d="M0 ${H} Q ${W / 2} ${H - 40} ${W} ${H} L ${W} ${H - 80} Q ${W / 2} ${H - 30} 0 ${H - 80} Z" fill="#7c5a32" fill-opacity="0.35"/>
  <!-- scratched ink lettering placeholder: cross/plus mark -->
  <g transform="translate(${W / 2}, ${H * 0.45})" stroke="#1d100a" stroke-linecap="round" stroke-opacity="0.85">
    <path d="M-180 0 L 180 0" stroke-width="6"/>
    <path d="M0 -240 L 0 240" stroke-width="6"/>
    <circle r="58" fill="none" stroke-width="4" stroke-opacity="0.7"/>
    <circle r="120" fill="none" stroke-width="2" stroke-dasharray="6 8" stroke-opacity="0.55"/>
  </g>
  <!-- wax seal -->
  <g transform="translate(${W / 2}, ${H * 0.78})">
    <circle r="80" fill="#8b1f1c"/>
    <circle r="80" fill="none" stroke="#5a0d0b" stroke-width="2"/>
    <circle r="68" fill="none" stroke="#c33c38" stroke-width="1.4" stroke-opacity="0.8"/>
    <text text-anchor="middle" y="14" font-family="Georgia, serif" font-size="42" font-weight="700" fill="#2a0807" fill-opacity="0.85">V</text>
  </g>
  <!-- ink spatter -->
  ${inkSpatters(8)}
`;
  return svgWrap(inner, "Aged parchment cover with scratched ink lettering and wax seal");
}

// ─── Variant 3 — modern minimal ───────────────────────────────────────────
function variantMinimal(): string {
  const inner = `
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <!-- subtle grain -->
  <rect width="${W}" height="${H}" fill="black" fill-opacity="0.015"/>
  <!-- dark gothic motif: thin vertical line + circle (echoing a candle flame) -->
  <g transform="translate(${W / 2}, ${H * 0.46})">
    <line x1="0" y1="-260" x2="0" y2="260" stroke="${INK}" stroke-width="2"/>
    <circle r="64" fill="none" stroke="${INK}" stroke-width="2"/>
    <circle r="20" fill="${INK}"/>
  </g>
  <!-- bottom rule -->
  <line x1="${W * 0.18}" y1="${H * 0.86}" x2="${W * 0.82}" y2="${H * 0.86}" stroke="${INK}" stroke-width="1.5"/>
  <!-- top rule -->
  <line x1="${W * 0.18}" y1="${H * 0.14}" x2="${W * 0.82}" y2="${H * 0.14}" stroke="${INK}" stroke-width="1.5"/>
`;
  return svgWrap(inner, "Modern minimal cream cover with single dark gothic motif");
}

// ─── Variant 4 — candlelight on weathered wood ────────────────────────────
function variantCandlelight(): string {
  const inner = `
  <defs>
    <radialGradient id="candleGlow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="${BRAND_AMBER}" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="${BRAND_ROSE}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#0a0603" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="woodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1a0e08"/>
      <stop offset="100%" stop-color="#0a0603"/>
    </linearGradient>
    <pattern id="grain" width="7" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 0 Q 3.5 8 0 16 Q -3.5 24 0 32 Q 3.5 40 0 48" stroke="#2a1810" stroke-width="0.8" fill="none" stroke-opacity="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#woodGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#grain)"/>
  <rect width="${W}" height="${H}" fill="url(#candleGlow)"/>
  <!-- candle / flame in upper third -->
  <g transform="translate(${W / 2}, ${H * 0.38})">
    <ellipse rx="120" ry="200" fill="${BRAND_AMBER}" fill-opacity="0.12"/>
    <ellipse rx="60" ry="100" fill="${BRAND_AMBER}" fill-opacity="0.25"/>
    <path d="M-12 -90 Q 0 -140 12 -90 Q 18 -40 0 -10 Q -18 -40 -12 -90 Z" fill="${BRAND_AMBER}"/>
    <path d="M-6 -70 Q 0 -100 6 -70 Q 8 -40 0 -20 Q -8 -40 -6 -70 Z" fill="${PAPER}" fill-opacity="0.85"/>
    <!-- wax stick -->
    <rect x="-14" y="-10" width="28" height="160" fill="${PAPER}" fill-opacity="0.85"/>
    <rect x="-14" y="-10" width="28" height="160" fill="none" stroke="${INK}" stroke-opacity="0.4"/>
  </g>
  <!-- pages hint at bottom -->
  <rect x="${W * 0.18}" y="${H * 0.78}" width="${W * 0.64}" height="${H * 0.06}" fill="${PARCHMENT}" fill-opacity="0.7"/>
  <rect x="${W * 0.18}" y="${H * 0.78}" width="${W * 0.64}" height="${H * 0.06}" fill="none" stroke="${INK}" stroke-opacity="0.4"/>
  <line x1="${W * 0.22}" y1="${H * 0.81}" x2="${W * 0.78}" y2="${H * 0.81}" stroke="${INK}" stroke-opacity="0.3"/>
`;
  return svgWrap(inner, "Candlelight on weathered dark wood with antique pages");
}

function corners(stroke: string): string {
  const cs = 60;
  const drawCorner = (x: number, y: number, sx: number, sy: number) => `
    <g transform="translate(${x} ${y}) scale(${sx} ${sy})">
      <path d="M0 ${cs} L0 0 L${cs} 0" fill="none" stroke="${stroke}" stroke-width="2" stroke-opacity="0.85"/>
      <path d="M10 ${cs - 10} L${cs - 10} 10" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.6"/>
    </g>`;
  return [
    drawCorner(64, 80, 1, 1),
    drawCorner(W - 64, 80, -1, 1),
    drawCorner(64, H - 80, 1, -1),
    drawCorner(W - 64, H - 80, -1, -1),
  ].join("");
}

function inkSpatters(seed: number): string {
  const out: string[] = [];
  for (let i = 0; i < seed; i++) {
    const x = ((i * 173) % W) | 0;
    const y = ((i * 491) % H) | 0;
    const r = 1 + ((i * 53) % 4);
    out.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#1d100a" fill-opacity="${0.2 + (i % 3) * 0.1}"/>`
    );
  }
  return out.join("");
}

const VARIANTS: ReadonlyArray<CoverVariant> = [
  {
    filename: "01.svg",
    description: "Leather-bound antique journal, gold embossed",
    render: variantLeather,
  },
  {
    filename: "02.svg",
    description: "Aged parchment with scratched ink + wax seal",
    render: variantParchment,
  },
  {
    filename: "03.svg",
    description: "Modern minimal cream with single dark motif",
    render: variantMinimal,
  },
  {
    filename: "04.svg",
    description: "Candlelight on weathered wood with pages",
    render: variantCandlelight,
  },
];

function main(): void {
  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  for (const v of VARIANTS) {
    const out = path.join(OUT_DIR, v.filename);
    writeFileSync(out, v.render(), "utf8");
    console.log(`[demo-covers] ${v.filename} (${v.description}) → ${out}`);
  }
  console.log(`\n[demo-covers] Done. ${VARIANTS.length} files in ${OUT_DIR}`);
}

main();
