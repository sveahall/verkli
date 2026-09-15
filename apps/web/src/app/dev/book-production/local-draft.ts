import { z } from "zod";
import { productionSettingsSchema } from "@/features/book-production/model";

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
