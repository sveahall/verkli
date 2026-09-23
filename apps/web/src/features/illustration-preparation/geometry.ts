export type CropSettings = { aspect: "original" | "square" | "landscape" | "portrait"; zoom: number; x: number; y: number };
export function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 20_000 || height > 20_000 || width * height > 40_000_000) {
    throw new Error("Choose an image with valid dimensions, up to 40 megapixels and 20,000 pixels per side.");
  }
}

export function calculateCrop(width: number, height: number, settings: CropSettings): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  validateDimensions(width, height);
  const { aspect, zoom, x, y } = settings;
  if (!["original", "square", "landscape", "portrait"].includes(aspect) || ![zoom, x, y].every(Number.isFinite) || zoom < 1 || zoom > 3 || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new Error("Choose valid crop settings: zoom 1–3 and position 0–100%.");
  }
  const ratio = aspect === "original" ? width / height : aspect === "square" ? 1 : aspect === "landscape" ? 3 / 2 : 2 / 3;
  const sw = Math.min(width, height * ratio) / zoom;
  const sh = Math.min(height, width / ratio) / zoom;
  if (sw < 1 || sh < 1) throw new Error("This crop is too small. Reduce zoom or choose a larger image.");
  const scale = Math.min(1, 1600 / sw, 1600 / sh);
  return { sx: (width - sw) * (x / 100), sy: (height - sh) * (y / 100), sw, sh, width: Math.max(1, Math.floor(sw * scale)), height: Math.max(1, Math.floor(sh * scale)) };
}
