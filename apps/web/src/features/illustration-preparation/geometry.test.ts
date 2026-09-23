import { expect, it } from "vitest";
import { calculateCrop, type CropSettings } from "./geometry";

const centered: CropSettings = { aspect: "square", zoom: 1, x: 50, y: 50 };

it("fits and positions a square inside a landscape source", () => {
  expect(calculateCrop(400, 200, centered)).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200, width: 200, height: 200 });
  expect(calculateCrop(400, 200, { ...centered, x: 0 }).sx).toBe(0);
  expect(calculateCrop(400, 200, { ...centered, x: 100 }).sx).toBe(200);
  expect(calculateCrop(400, 200, { ...centered, zoom: 2 })).toEqual({ sx: 150, sy: 50, sw: 100, sh: 100, width: 100, height: 100 });
});

it("fits each aspect preset and caps output without upscaling", () => {
  expect(calculateCrop(300, 600, { ...centered, aspect: "portrait" })).toEqual({ sx: 0, sy: 75, sw: 300, sh: 450, width: 300, height: 450 });
  expect(calculateCrop(6000, 4000, { ...centered, aspect: "landscape" })).toMatchObject({ width: 1600, height: 1066 });
  expect(calculateCrop(300, 201, { ...centered, aspect: "original" })).toMatchObject({ sw: 300, sh: 201, width: 300, height: 201 });
});

it("keeps crops inside the source at all framing extremes", () => {
  for (const aspect of ["original", "square", "landscape", "portrait"] as const) {
    for (const zoom of [1, 1.7, 3]) for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
      const crop = calculateCrop(433, 797, { aspect, zoom, x, y });
      expect(crop.sx).toBeGreaterThanOrEqual(0);
      expect(crop.sy).toBeGreaterThanOrEqual(0);
      expect(crop.sx + crop.sw).toBeLessThanOrEqual(433);
      expect(crop.sy + crop.sh).toBeLessThanOrEqual(797);
      expect(crop.width).toBeLessThanOrEqual(crop.sw);
      expect(crop.height).toBeLessThanOrEqual(crop.sh);
      expect(Number.isInteger(crop.width) && Number.isInteger(crop.height)).toBe(true);
    }
  }
});

it("rejects invalid dimensions, unsupported settings and subpixel crops", () => {
  for (const [width, height] of [[0, 100], [NaN, 100], [Infinity, 100], [20001, 1], [10000, 5000], [1.5, 100]]) {
    expect(() => calculateCrop(width, height, centered)).toThrow("dimensions");
  }
  for (const settings of [{ zoom: NaN }, { zoom: 0 }, { zoom: 4 }, { x: Infinity }, { x: -1 }, { y: 101 }, { aspect: "other" }]) {
    expect(() => calculateCrop(100, 100, { ...centered, ...settings } as CropSettings)).toThrow("crop");
  }
  expect(() => calculateCrop(1, 1, { ...centered, zoom: 3 })).toThrow("small");
});

it("does not round an extreme fractional crop beyond its source edge", () => {
  const crop = calculateCrop(6597, 1721, { aspect: "portrait", zoom: 1.7, x: 100, y: 100 });
  expect(crop.sx + crop.sw).toBeLessThanOrEqual(6597);
  expect(crop.sy + crop.sh).toBeLessThanOrEqual(1721);
});
