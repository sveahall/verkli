/**
 * Generates a dotted world map: individual circle positions on a lat/lon grid.
 * Each grid point that falls inside a country → one dot with SVG coordinates.
 *
 * Run:  node apps/web/scripts/generate-world-map.mjs
 */

import { geoNaturalEarth1, geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const atlas = require("world-atlas/countries-110m.json");

const geo = feature(atlas, atlas.objects.countries);
const projection = geoNaturalEarth1().fitSize([800, 420], geo);

const STEP = 3; // degrees between dots
const dots = [];

for (let lat = 84; lat >= -56; lat -= STEP) {
  for (let lon = -180; lon < 180; lon += STEP) {
    const point = [lon, lat];
    for (const feat of geo.features) {
      if (geoContains(feat, point)) {
        const projected = projection(point);
        if (projected) {
          dots.push({
            x: Math.round(projected[0]),
            y: Math.round(projected[1]),
            id: String(feat.id ?? ""),
          });
        }
        break; // found the country, next grid point
      }
    }
  }
}

const output = `// AUTO-GENERATED — do not edit
// Dotted world map: ${STEP}° grid, Natural Earth projection, 800×420 viewBox
// Run:  node apps/web/scripts/generate-world-map.mjs

export const WORLD_DOTS: { x: number; y: number; id: string }[] = ${JSON.stringify(dots)};
`;

const dest = new URL(
  "../src/features/author-workspaces/home/components/world-map-paths.ts",
  import.meta.url,
);
writeFileSync(dest, output);
console.log(`Done — ${dots.length} dots → ${dest.pathname}`);
