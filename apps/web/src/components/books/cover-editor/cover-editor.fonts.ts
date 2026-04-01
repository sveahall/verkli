export type CoverFont = {
  family: string;
  label: string;
  category: "serif" | "sans" | "display" | "handwritten";
  weights: number[];
  googleUrl: string;
};

export const COVER_EDITOR_FONTS: CoverFont[] = [
  { family: "Playfair Display", label: "Playfair", category: "serif", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap" },
  { family: "Lora", label: "Lora", category: "serif", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap" },
  { family: "Merriweather", label: "Merriweather", category: "serif", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap" },
  { family: "Inter", label: "Inter", category: "sans", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" },
  { family: "Montserrat", label: "Montserrat", category: "sans", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" },
  { family: "Raleway", label: "Raleway", category: "sans", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&display=swap" },
  { family: "Cormorant Garamond", label: "Cormorant", category: "display", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&display=swap" },
  { family: "Bebas Neue", label: "Bebas Neue", category: "display", weights: [400], googleUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" },
  { family: "Dancing Script", label: "Dancing Script", category: "handwritten", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap" },
  { family: "Oswald", label: "Oswald", category: "sans", weights: [400, 700], googleUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap" },
];

const loadedFonts = new Set<string>();

export async function loadFont(font: CoverFont): Promise<void> {
  if (loadedFonts.has(font.family)) return;
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = font.googleUrl;
    document.head.appendChild(link);
    await Promise.all(
      font.weights.map((w) =>
        document.fonts.load(`${w} 16px "${font.family}"`)
      )
    );
    loadedFonts.add(font.family);
  } catch {
    // Silently continue — font will fall back to sans-serif
  }
}

export async function loadAllFonts(): Promise<void> {
  await Promise.allSettled(COVER_EDITOR_FONTS.map(loadFont));
}
