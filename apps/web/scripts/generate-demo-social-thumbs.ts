/**
 * Generate native-format social thumbnails for the investor pitch demo.
 *
 * Output: apps/web/public/demo-assets/social/<lang>-<channel>.svg
 *
 * Unlike the first pass (which rendered the same gradient book-cover card for
 * every channel), each channel now renders in its real native post format so
 * the distribution grid reads like genuine cross-platform content:
 *
 *   - video (TikTok, YouTube Shorts) → 9:16 player frame: play button, action
 *     rail, caption overlay, progress bar, duration.
 *   - image (Instagram)             → 1:1 feed post: header bar, pull-quote
 *     creative, action row, like count + caption.
 *   - text  (X, Threads)            → 16:9 post card: avatar, name + verified,
 *     body copy, link preview, engagement row.
 *
 * Content (captions, handles, metrics, titles) comes from the shared module
 * src/lib/demo-social-posts.ts so the generated artwork, the grid, and the
 * in-app preview modal never drift apart.
 *
 * Why SVG: vector, native to every browser/<img>/og:image renderer, no native
 * build deps. We are not posting to the real platforms — these are façade
 * thumbnails that look correct in each channel's native aspect ratio.
 *
 * Idempotent: regenerates the .svg files on every run.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANNEL_META,
  DEMO_CHANNELS,
  DEMO_DISTRIBUTION_LANGUAGES,
  formatMetric,
  getDemoSocialPost,
  type DemoSocialPost,
} from "../src/lib/demo-social-posts";

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
const X_BLUE = "#1D9BF0";

// ── SVG helpers ──────────────────────────────────────────────────────────────
function svgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word-wrap to at most `maxLines` lines of ~`maxChars` each. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // If we truncated, add an ellipsis to the last line.
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }
  return lines;
}

function tspans(
  lines: string[],
  x: number,
  lineHeight: number
): string {
  return lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${svgText(line)}</tspan>`
    )
    .join("");
}

/** 24×24-based icon rendered at (x, y) scaled to `size`. */
function icon(pathD: string, x: number, y: number, size: number, fill: string): string {
  const s = size / 24;
  return `<g transform="translate(${x},${y}) scale(${s})"><path d="${pathD}" fill="${fill}"/></g>`;
}

const ICONS = {
  heart:
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  comment:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
  share: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  repost: "M23 7l-4-4v3h-9v2h9v3l4-4zM1 17l4 4v-3h9v-2H5v-3l-4 4z",
  bookmark: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z",
  play: "M8 5v14l11-7z",
  views: "M3 13h2v8H3v-8zm4-6h2v14H7V7zm4 3h2v11h-2V10zm4-7h2v18h-2V3z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
} as const;

/** Gradient avatar disc with a "V" monogram. */
function avatar(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#avatarGrad)"/>
  <text class="display" x="${cx}" y="${cy + r * 0.36}" text-anchor="middle" fill="${PAPER}" font-size="${r * 1.05}">V</text>`;
}

function verifiedBadge(cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>${icon(
    ICONS.check,
    cx - r * 0.72,
    cy - r * 0.72,
    r * 1.44,
    "#FFFFFF"
  )}`;
}

const DEFS = `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_VIOLET}"/>
      <stop offset="55%" stop-color="${BRAND_ROSE}"/>
      <stop offset="100%" stop-color="${BRAND_AMBER}"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_VIOLET}"/>
      <stop offset="100%" stop-color="${BRAND_ROSE}"/>
    </linearGradient>
    <linearGradient id="videoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#241A3D"/>
      <stop offset="55%" stop-color="#140E26"/>
      <stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="videoGlow" cx="50%" cy="34%" r="55%">
      <stop offset="0%" stop-color="${BRAND_VIOLET}" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="${BRAND_ROSE}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${BRAND_ROSE}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>
    </linearGradient>
    <style><![CDATA[
      .display { font-family: "Montserrat Alternates", "Inter", ui-sans-serif, system-ui, sans-serif; font-weight: 700; letter-spacing: -0.02em; }
      .body { font-family: "Inter", ui-sans-serif, system-ui, sans-serif; font-weight: 500; }
      .bold { font-family: "Inter", ui-sans-serif, system-ui, sans-serif; font-weight: 700; }
      .serif { font-family: "Georgia", "Times New Roman", serif; font-style: italic; }
    ]]></style>
  </defs>`;

function wrap(width: number, height: number, label: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${svgText(label)}">
  ${DEFS}
  ${body}
</svg>
`;
}

// ── Video template (TikTok / YouTube Shorts, 9:16) ───────────────────────────
function renderVideo(post: DemoSocialPost): string {
  const { width, height } = CHANNEL_META[post.channel];
  const m = post.metrics;

  const railX = width - 150;
  const railIcon = (pathD: string, cy: number, count: string) =>
    `${icon(pathD, railX - 38, cy - 38, 76, PAPER)}
     <text class="bold" x="${railX}" y="${cy + 78}" text-anchor="middle" fill="${PAPER}" font-size="32">${svgText(count)}</text>`;

  const captionLines = wrapText(post.caption, 30, 3);
  const captionStartY = height - 360;
  const handleLabel = post.handle;
  const hashtagLine = post.hashtags.slice(0, 3).join("  ");

  return wrap(
    width,
    height,
    `${post.title} — ${post.label} (${post.language.toUpperCase()})`,
    `
  <rect width="${width}" height="${height}" fill="url(#videoGrad)"/>
  <rect width="${width}" height="${height}" fill="url(#videoGlow)"/>

  <!-- Cover-art title, set large as the video's hero frame -->
  <text class="body" x="80" y="${height * 0.3}" fill="${BRAND_AMBER}" font-size="30" letter-spacing="0.24em" style="text-transform:uppercase;">Verkli Audiobook</text>
  <text class="display" x="80" y="${height * 0.3 + 96}" fill="${PAPER}" font-size="92">${tspans(wrapText(post.title, 14, 2), 80, 104)}</text>
  <text class="body" x="80" y="${height * 0.3 + 96 + (wrapText(post.title, 14, 2).length) * 104 + 24}" fill="${PAPER}" fill-opacity="0.72" font-size="34">${svgText(post.byline)}</text>

  <!-- Center play button -->
  <circle cx="${width / 2}" cy="${height / 2}" r="92" fill="${PAPER}" fill-opacity="0.16"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="92" fill="none" stroke="${PAPER}" stroke-opacity="0.5" stroke-width="3"/>
  ${icon(ICONS.play, width / 2 - 36, height / 2 - 36, 72, PAPER)}

  <!-- Duration pill -->
  <rect x="${width - 200}" y="60" width="140" height="58" rx="29" fill="#000000" fill-opacity="0.5"/>
  <text class="bold" x="${width - 130}" y="98" text-anchor="middle" fill="${PAPER}" font-size="30">${svgText(post.durationLabel ?? "0:30")}</text>

  <!-- Channel chip top-left -->
  <text class="bold" x="80" y="100" fill="${PAPER}" font-size="34">${svgText(post.label)}</text>
  <rect x="80" y="120" width="84" height="44" rx="22" fill="${BRAND_VIOLET}"/>
  <text class="bold" x="122" y="151" text-anchor="middle" fill="${PAPER}" font-size="26">${svgText(post.language.toUpperCase())}</text>

  <!-- Right action rail -->
  ${avatar(railX, height / 2 - 40, 52)}
  ${railIcon(ICONS.heart, height / 2 + 120, formatMetric(m.likes))}
  ${railIcon(ICONS.comment, height / 2 + 320, formatMetric(m.comments))}
  ${railIcon(ICONS.share, height / 2 + 520, formatMetric(m.shares))}

  <!-- Bottom scrim + caption -->
  <rect x="0" y="${height - 460}" width="${width}" height="460" fill="url(#scrim)"/>
  <text class="bold" x="80" y="${captionStartY - 40}" fill="${PAPER}" font-size="40">${svgText(handleLabel)}</text>
  <text class="body" x="80" y="${captionStartY + 20}" fill="${PAPER}" font-size="38">${tspans(captionLines, 80, 56)}</text>
  <text class="bold" x="80" y="${captionStartY + 20 + captionLines.length * 56 + 30}" fill="${BRAND_AMBER}" font-size="36">${svgText(hashtagLine)}</text>

  <!-- Views + progress bar -->
  ${post.metrics.views != null ? `${icon(ICONS.play, 80, height - 120, 36, PAPER)}<text class="bold" x="128" y="${height - 90}" fill="${PAPER}" font-size="32">${svgText(formatMetric(post.metrics.views))} views</text>` : ""}
  <rect x="0" y="${height - 14}" width="${width}" height="14" fill="${PAPER}" fill-opacity="0.25"/>
  <rect x="0" y="${height - 14}" width="${width * 0.34}" height="14" fill="${PAPER}"/>
`
  );
}

// ── Image template (Instagram, 1:1) ──────────────────────────────────────────
function renderImage(post: DemoSocialPost): string {
  const { width, height } = CHANNEL_META[post.channel];
  const headerH = 132;
  const footerH = 232;
  const creativeY = headerH;
  const creativeH = height - headerH - footerH;
  const m = post.metrics;

  const iconY = height - footerH + 44;
  const captionLines = wrapText(post.caption, 64, 2);

  return wrap(
    width,
    height,
    `${post.title} — ${post.label} (${post.language.toUpperCase()})`,
    `
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>

  <!-- Header bar -->
  ${avatar(72, headerH / 2, 40)}
  <text class="bold" x="132" y="${headerH / 2 - 4}" fill="${INK}" font-size="34">${svgText(post.handle)}</text>
  <text class="body" x="132" y="${headerH / 2 + 34}" fill="#8A8A8A" font-size="26">Sponsrad · Verkli</text>
  <circle cx="${width - 70}" cy="${headerH / 2 - 16}" r="5" fill="${INK}"/>
  <circle cx="${width - 70}" cy="${headerH / 2}" r="5" fill="${INK}"/>
  <circle cx="${width - 70}" cy="${headerH / 2 + 16}" r="5" fill="${INK}"/>

  <!-- Creative: brand gradient with pull-quote -->
  <rect x="0" y="${creativeY}" width="${width}" height="${creativeH}" fill="url(#bgGrad)"/>
  <rect x="0" y="${creativeY}" width="${width}" height="${creativeH}" fill="#000000" fill-opacity="0.18"/>
  <text class="body" x="${width / 2}" y="${creativeY + 96}" text-anchor="middle" fill="${PAPER}" font-size="26" letter-spacing="0.26em" style="text-transform:uppercase;">Verkli Audiobook</text>
  <text class="serif" x="${width / 2}" y="${creativeY + creativeH / 2 - 20}" text-anchor="middle" fill="${PAPER}" font-size="52">${tspans(wrapText(post.quote ?? post.title, 30, 3), width / 2, 66)}</text>
  <text class="display" x="${width / 2}" y="${creativeY + creativeH - 110}" text-anchor="middle" fill="${PAPER}" font-size="48">${svgText(post.title)}</text>
  <text class="body" x="${width / 2}" y="${creativeY + creativeH - 60}" text-anchor="middle" fill="${PAPER}" fill-opacity="0.82" font-size="30">${svgText(post.byline)}</text>

  <!-- Action row -->
  ${icon(ICONS.heart, 56, iconY, 56, INK)}
  ${icon(ICONS.comment, 132, iconY, 56, INK)}
  ${icon(ICONS.share, 208, iconY, 56, INK)}
  ${icon(ICONS.bookmark, width - 84, iconY, 56, INK)}

  <!-- Likes + caption -->
  <text class="bold" x="56" y="${iconY + 112}" fill="${INK}" font-size="32">${svgText(formatMetric(m.likes))} gilla-markeringar</text>
  <text class="bold" x="56" y="${iconY + 158}" fill="${INK}" font-size="30">${svgText(post.handle)}</text>
  <text class="body" x="56" y="${iconY + 200}" fill="${INK}" font-size="30">${tspans(captionLines, 56, 40)}</text>
`
  );
}

// ── Text template (X / Threads, 16:9) ────────────────────────────────────────
function renderText(post: DemoSocialPost): string {
  const { width, height } = CHANNEL_META[post.channel];
  const isX = post.channel === "x";
  const m = post.metrics;
  const pad = 56;

  const bodyLines = wrapText(post.caption, 40, 3);
  const hashtagLine = post.hashtags.join("  ");
  const bodyY = 210;
  const bodyLineH = 50;
  const linkY = bodyY + bodyLines.length * bodyLineH + 70;
  const linkH = 150;

  const engageY = height - 56;
  const engage = (pathD: string, x: number, count: string) =>
    `${icon(pathD, x, engageY - 30, 38, "#536471")}<text class="body" x="${x + 52}" y="${engageY}" fill="#536471" font-size="30">${svgText(count)}</text>`;

  return wrap(
    width,
    height,
    `${post.title} — ${post.label} (${post.language.toUpperCase()})`,
    `
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="28" fill="none" stroke="#E1E8ED" stroke-width="2"/>

  <!-- Header -->
  ${avatar(pad + 44, 96, 44)}
  <text class="bold" x="${pad + 110}" y="84" fill="#0F1419" font-size="36">${svgText(post.displayName)}</text>
  ${verifiedBadge(pad + 110 + post.displayName.length * 19 + 28, 72, 18, isX ? X_BLUE : "#0F1419")}
  <text class="body" x="${pad + 110}" y="128" fill="#536471" font-size="30">${svgText(post.handle)} · 2h</text>
  <!-- Channel chip -->
  <text class="bold" x="${width - pad}" y="84" text-anchor="end" fill="#536471" font-size="30">${svgText(post.label)} · ${svgText(post.language.toUpperCase())}</text>

  <!-- Body -->
  <text class="body" x="${pad}" y="${bodyY}" fill="#0F1419" font-size="40">${tspans(bodyLines, pad, bodyLineH)}</text>
  <text class="bold" x="${pad}" y="${bodyY + bodyLines.length * bodyLineH + 16}" fill="${BRAND_VIOLET}" font-size="34">${svgText(hashtagLine)}</text>

  <!-- Link preview -->
  <rect x="${pad}" y="${linkY}" width="${width - pad * 2}" height="${linkH}" rx="20" fill="#F7F9F9" stroke="#E1E8ED" stroke-width="2"/>
  <rect x="${pad + 16}" y="${linkY + 16}" width="${linkH - 32}" height="${linkH - 32}" rx="12" fill="url(#bgGrad)"/>
  <text class="display" x="${pad + linkH + 8}" y="${linkY + 58}" fill="#0F1419" font-size="34">${svgText(post.title)}</text>
  <text class="body" x="${pad + linkH + 8}" y="${linkY + 100}" fill="#536471" font-size="28">${svgText(post.byline)} · ${svgText(post.cta)}</text>
  <text class="body" x="${pad + linkH + 8}" y="${linkY + 134}" fill="#8899A6" font-size="26">verkli.com</text>

  <!-- Engagement -->
  ${engage(ICONS.comment, pad, formatMetric(m.comments))}
  ${engage(ICONS.repost, pad + 240, formatMetric(m.shares))}
  ${engage(ICONS.heart, pad + 480, formatMetric(m.likes))}
  ${isX && m.views != null ? engage(ICONS.views, pad + 720, formatMetric(m.views)) : engage(ICONS.share, pad + 720, "")}
`
  );
}

function render(post: DemoSocialPost): string {
  switch (post.type) {
    case "video":
      return renderVideo(post);
    case "image":
      return renderImage(post);
    case "text":
      return renderText(post);
  }
}

function main(): void {
  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const channel of DEMO_CHANNELS) {
    for (const language of DEMO_DISTRIBUTION_LANGUAGES) {
      const post = getDemoSocialPost(channel, language);
      const svg = render(post);
      const filename = `${language}-${channel}.svg`;
      writeFileSync(path.join(OUT_DIR, filename), svg, "utf8");
      const meta = CHANNEL_META[channel];
      console.log(
        `[demo-social] [${language}/${channel}] ${meta.type} ${meta.width}×${meta.height} → ${filename}`
      );
      count += 1;
    }
  }
  console.log(`\n[demo-social] Done. ${count} files in ${OUT_DIR}`);
}

main();
