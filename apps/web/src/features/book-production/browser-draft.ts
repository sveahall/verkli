import { z } from "zod";
import { productionSettingsSchema, type ProductionSettings } from "@/features/book-production/model";
import type { ArtworkMap, ArtworkSide, ProductionArtwork } from "./ProductionCover";

export type BrowserProductionDraft = { settings: ProductionSettings; artwork: ArtworkMap; savedSettings: ProductionSettings; recoveryNotice?: string };
// Unsaved changes survive client-side navigation, including temporarily invalid
// fields. They never cross accounts or editions, and a full page load clears them.
const pendingDrafts = new Map<string, BrowserProductionDraft>();
const warnUnsaved = (event: BeforeUnloadEvent) => { event.preventDefault(); };
export function pendingProductionDraft(key: string) { return pendingDrafts.get(key); }
export function rememberProductionDraft(key: string, draft: BrowserProductionDraft) {
  if (!draft.recoveryNotice && JSON.stringify(draft.settings) === JSON.stringify(draft.savedSettings)) pendingDrafts.delete(key);
  else pendingDrafts.set(key, draft);
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", warnUnsaved);
    if (pendingDrafts.size) window.addEventListener("beforeunload", warnUnsaved);
  }
}

export function productionDraftKey(ownerId: string, bookId: string, versionId: string) {
  return `verkli-print-draft-v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(bookId)}:${encodeURIComponent(versionId)}`;
}

export async function readPrintArtwork(side: ArtworkSide, file: File): Promise<ProductionArtwork> {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error("Choose a JPG or PNG image smaller than 20 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("This image could not be opened. Choose a valid JPG or PNG file."); }
  const width = bitmap.width; const height = bitmap.height; bitmap.close();
  if (width > 20000 || height > 20000 || width * height > 50_000_000) throw new Error("Choose an image below 50 megapixels and 20,000 pixels per side.");
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image. Try selecting it again."));
    reader.readAsDataURL(file);
  });
  return { path: `preview/${side}-${crypto.randomUUID()}.jpg`, url, width, height };
}

const artworkSchema = z.object({
  path: z.string().regex(/^preview\/(front|back)-[0-9a-f-]{36}\.jpg$/),
  url: z.string().max(28_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
  width: z.number().finite().int().positive().max(20000),
  height: z.number().finite().int().positive().max(20000),
}).strict().refine((asset) => asset.width * asset.height <= 50_000_000, "Artwork exceeds 50 megapixels.");

export const localDraftSchema = z.object({
  settings: productionSettingsSchema,
  artwork: z.object({ front: artworkSchema.optional(), back: artworkSchema.optional() }).strict(),
}).strict().superRefine((draft, context) => {
  for (const side of ["front", "back"] as const) {
    const asset = draft.artwork[side];
    const path = draft.settings.cover[side === "front" ? "frontPath" : "backPath"];
    if ((asset?.path ?? null) !== path || (asset && !asset.path.startsWith(`preview/${side}-`))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artwork", side], message: "Artwork must belong to the selected cover side." });
    }
  }
});
