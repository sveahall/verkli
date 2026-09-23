import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { scopeKeySchema } from "@/features/illustration-candidates/contracts";
import { CandidateError, CandidateService } from "./service";
import { createCandidatePorts } from "./repository";
import { candidateFailure, privateHeaders, readCandidateBody } from "./http";

export type CandidateRouteContext = { params: Promise<{ id: string; editionId: string; chapterId: string; assetId?: string }> };
async function service(context: CandidateRouteContext) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response || !user) throw new CandidateError(response?.status ?? 401, "AUTH_REQUIRED", "Sign in with an approved author account to open image candidates.");
  const params = await context.params;
  const key = scopeKeySchema.safeParse({ bookId: params.id, editionId: params.editionId, chapterId: params.chapterId });
  if (!key.success) throw new CandidateError(404, "NOT_FOUND", "This chapter is unavailable.");
  return new CandidateService(await createCandidatePorts(), user.id, key.data);
}
export async function listCandidates(_request: Request, context: CandidateRouteContext) {
  try { return Response.json(await (await service(context)).list(), { headers: privateHeaders }); }
  catch (error) { return candidateFailure(error); }
}
export async function saveCandidate(request: Request, context: CandidateRouteContext) {
  try {
    const candidates = await service(context);
    const { intent, file } = await readCandidateBody(request);
    return Response.json(await candidates.save(intent, file), { headers: privateHeaders });
  } catch (error) { return candidateFailure(error); }
}
export async function candidateImage(_request: Request, context: CandidateRouteContext) {
  try {
    const candidates = await service(context);
    const { bytes, mime } = await candidates.image((await context.params).assetId ?? "");
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": mime, "Content-Length": String(bytes.length) } });
  } catch (error) { return candidateFailure(error); }
}
