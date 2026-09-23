import { NextResponse } from "next/server";
import {
  authorizeProductionEdition, loadProductionArtworkMap, loadProductionDraft,
  ProductionError, productionErrorResponse, productionSaveSchema,
  readProductionJson, saveProductionDraft,
} from "@/lib/book-production/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const context = await authorizeProductionEdition(id, new URL(request.url).searchParams.get("versionId") ?? "");
    const draft = await loadProductionDraft(context);
    const artwork = await loadProductionArtworkMap(context, draft.settings);
    return NextResponse.json({ ...draft, artwork }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const body = productionSaveSchema.safeParse(await readProductionJson(request));
    if (!body.success) throw new ProductionError(400, "PRODUCTION_SETTINGS_INVALID", body.error.issues[0]?.message ?? "Check the print layout settings before saving.");
    const queryVersion = new URL(request.url).searchParams.get("versionId");
    if (queryVersion !== null && queryVersion !== body.data.versionId) throw new ProductionError(400, "PRODUCTION_INVALID_EDITION", "The requested edition does not match this layout.");
    const { id } = await params;
    const context = await authorizeProductionEdition(id, body.data.versionId);
    const draft = await saveProductionDraft(context, body.data.settings, body.data.revision);
    return NextResponse.json(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}
