/**
 * Generate native-format social thumbnails for the investor pitch demo.
 *
 * Output: apps/web/public/demo-assets/social/<lang>-<channel>.svg
 *         (10 languages × 4 channels = 40 files)
 *
 * Why SVG: vector, native to every browser/<img>/og:image renderer, no native
 * deps to add to the build. The demo UI consumes these as static assets and
 * the seed stores the URLs in marketing_campaigns.metadata. We are not posting
 * to the real platforms — these are façade thumbnails that look correct in
 * the channel's native aspect ratio.
 *
 * Idempotent: regenerates the .svg files on every run.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const OUT_DIR = path.join(PUBLIC_DIR, "demo-assets", "social");

// Brand tokens (literal hex, mirrors DESIGN.md). Hard-coded here because this
// script runs in plain Node without the Next.js Tailwind/CSS context.
const BRAND_VIOLET = "#907AFF";
const BRAND_ROSE = "#E29ED5";
const BRAND_AMBER = "#FCC997";
const INK = "#0E0B1A";
const PAPER = "#FDF8EE";

type Channel = "tiktok" | "instagram" | "x" | "youtube";

interface ChannelSpec {
  id: Channel;
  width: number;
  height: number;
  /** Channel chip label rendered on the artwork. */
  label: string;
}

const CHANNELS: ReadonlyArray<ChannelSpec> = [
  { id: "tiktok", width: 1080, height: 1920, label: "TikTok" },
  { id: "instagram", width: 1080, height: 1350, label: "Instagram" },
  { id: "x", width: 1200, height: 675, label: "X" },
  { id: "youtube", width: 1080, height: 1920, label: "YouTube Shorts" },
];

interface LanguageSpec {
  code: string;
  /** Localized book title — matches scripts/seed-data/haunted-diary.ts. */
  title: string;
  /** Localized "Listen now" CTA. */
  cta: string;
  /** Localized author label, e.g. "by Astrid Halvorsen" / "av Astrid Halvorsen". */
  byline: string;
}

// Author display name comes from scripts/seed-data/haunted-diary.ts:
// "Astrid Halvorsen". Bylines below are locale-appropriate.
const LANGUAGES: ReadonlyArray<LanguageSpec> = [
  { code: "sv", title: "Den hemsökta dagboken", cta: "Lyssna nu", byline: "av Astrid Halvorsen" },
  { code: "en", title: "The Haunted Diary", cta: "Listen now", byline: "by Astrid Halvorsen" },
  { code: "de", title: "Das heimgesuchte Tagebuch", cta: "Jetzt anhören", byline: "von Astrid Halvorsen" },
  { code: "fr", title: "Le journal hanté", cta: "Écouter maintenant", byline: "par Astrid Halvorsen" },
  { code: "es", title: "El diario embrujado", cta: "Escuchar ahora", byline: "por Astrid Halvorsen" },
  { code: "it", title: "Il diario infestato", cta: "Ascolta ora", byline: "di Astrid Halvorsen" },
  { code: "nl", title: "Het spookachtige dagboek", cta: "Nu luisteren", byline: "door Astrid Halvorsen" },
  { code: "pt", title: "O diário assombrado", cta: "Ouvir agora", byline: "por Astrid Halvorsen" },
  { code: "pl", title: "Nawiedzony pamiętnik", cta: "Posłuchaj teraz", byline: "Astrid Halvorsen" },
  { code: "ja", title: "呪われた日記", cta: "今すぐ聴く", byline: "アストリッド・ハルヴォルセン" },
];

/**
 * SVG-safe text escape. The strings above are author-controlled so this is
 * defensive — but cheap, and lets future contributors add languages without
 * worrying about ampersands or quotes breaking the file.
 */
function svgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface RenderArgs {
  channel: ChannelSpec;
  lang: LanguageSpec;
}

function render({ channel, lang }: RenderArgs): string {
  const { width, height } = channel;
  const isLandscape = width > height;

  // Card geometry — keep the cover/title block centered with generous breathing
  // room. Sizes scale with the shortest edge so all four formats stay legible.
  const minEdge = Math.min(width, height);
  const cardW = isLandscape ? width * 0.5 : width * 0.78;
  const cardH = isLandscape ? height * 0.74 : height * 0.5;
  const cardX = (width - cardW) / 2;
  const cardY = isLandscape ? (height - cardH) / 2 : height * 0.18;
  const cardR = Math.round(minEdge * 0.04);

  const titleSize = Math.round(minEdge * (isLandscape ? 0.07 : 0.075));
  const bylineSize = Math.round(minEdge * (isLandscape ? 0.025 : 0.028));
  const eyebrowSize = Math.round(minEdge * 0.022);
  const ctaSize = Math.round(minEdge * (isLandscape ? 0.04 : 0.05));
  const wordmarkSize = Math.round(minEdge * 0.028);
  const chipSize = Math.round(minEdge * 0.022);

  const ctaY = isLandscape ? height * 0.86 : height * 0.78;
  const wordmarkY = height - Math.round(minEdge * 0.04);

  // Channel chip in the upper-right corner of the artwork (outside the card).
  const chipPadX = Math.round(minEdge * 0.025);
  const chipPadY = Math.round(minEdge * 0.012);
  const chipText = svgText(channel.label.toUpperCase());
  const chipTextWidthEstimate = chipText.length * chipSize * 0.62;
  const chipW = chipTextWidthEstimate + chipPadX * 2;
  const chipH = chipSize + chipPadY * 2;
  const chipX = width - chipW - Math.round(minEdge * 0.04);
  const chipY = Math.round(minEdge * 0.04);

  const langBadge = svgText(lang.code.toUpperCase());
  const langBadgeSize = chipSize;
  const langBadgeR = Math.round(langBadgeSize * 1.4);
  const langBadgeCx = Math.round(minEdge * 0.04) + langBadgeR;
  const langBadgeCy = chipY + chipH / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${svgText(`${lang.title} — ${channel.label} thumbnail`)}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_VIOLET}"/>
      <stop offset="55%" stop-color="${BRAND_ROSE}"/>
      <stop offset="100%" stop-color="${BRAND_AMBER}"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1A1430"/>
      <stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="orbGrad" cx="20%" cy="15%" r="60%">
      <stop offset="0%" stop-color="${PAPER}" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="${PAPER}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
    <style><![CDATA[
      .display {
        font-family: "Montserrat Alternates", "Inter", ui-sans-serif, system-ui, sans-serif;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .body {
        font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
        font-weight: 500;
      }
    ]]></style>
  </defs>

  <!-- Brand gradient backdrop -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <rect width="${width}" height="${height}" fill="url(#orbGrad)"/>

  <!-- Cover card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="url(#cardGrad)" stroke="${PAPER}" stroke-opacity="0.08" stroke-width="2"/>

  <!-- Eyebrow -->
  <text class="body" x="${width / 2}" y="${cardY + cardH * 0.22}" text-anchor="middle" fill="${BRAND_AMBER}" font-size="${eyebrowSize}" letter-spacing="0.22em" style="text-transform: uppercase;">${svgText("Verkli Audiobook")}</text>

  <!-- Title (single line; title length is bounded by the language list above) -->
  <text class="display" x="${width / 2}" y="${cardY + cardH * 0.5}" text-anchor="middle" fill="${PAPER}" font-size="${titleSize}">${svgText(lang.title)}</text>

  <!-- Byline -->
  <text class="body" x="${width / 2}" y="${cardY + cardH * 0.66}" text-anchor="middle" fill="${PAPER}" fill-opacity="0.78" font-size="${bylineSize}">${svgText(lang.byline)}</text>

  <!-- CTA outside the card -->
  <text class="display" x="${width / 2}" y="${ctaY}" text-anchor="middle" fill="${INK}" font-size="${ctaSize}">▶  ${svgText(lang.cta)}</text>

  <!-- Verkli wordmark -->
  <text class="display" x="${width / 2}" y="${wordmarkY}" text-anchor="middle" fill="${INK}" fill-opacity="0.78" font-size="${wordmarkSize}" letter-spacing="0.12em">${svgText("VERKLI")}</text>

  <!-- Lang badge (top-left) -->
  <circle cx="${langBadgeCx}" cy="${langBadgeCy}" r="${langBadgeR}" fill="${INK}" fill-opacity="0.78"/>
  <text class="body" x="${langBadgeCx}" y="${langBadgeCy + langBadgeSize * 0.34}" text-anchor="middle" fill="${PAPER}" font-size="${langBadgeSize}" letter-spacing="0.06em">${langBadge}</text>

  <!-- Channel chip (top-right) -->
  <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="${chipH / 2}" ry="${chipH / 2}" fill="${INK}" fill-opacity="0.78"/>
  <text class="body" x="${chipX + chipW / 2}" y="${chipY + chipH / 2 + chipSize * 0.34}" text-anchor="middle" fill="${PAPER}" font-size="${chipSize}" letter-spacing="0.18em">${chipText}</text>
</svg>
`;
}

interface GeneratedThumb {
  language_code: string;
  channel: Channel;
  relative_url: string;
  width: number;
  height: number;
}

function main(): void {
  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const results: GeneratedThumb[] = [];
  for (const lang of LANGUAGES) {
    for (const channel of CHANNELS) {
      const svg = render({ channel, lang });
      const filename = `${lang.code}-${channel.id}.svg`;
      const filepath = path.join(OUT_DIR, filename);
      writeFileSync(filepath, svg, "utf8");
      results.push({
        language_code: lang.code,
        channel: channel.id,
        relative_url: `/demo-assets/social/${filename}`,
        width: channel.width,
        height: channel.height,
      });
      console.log(
        `[demo-social] [${lang.code}/${channel.id}] ${channel.width}×${channel.height} → ${filename}`
      );
    }
  }
  console.log(`\n[demo-social] Done. ${results.length} files in ${OUT_DIR}`);
}

main();
