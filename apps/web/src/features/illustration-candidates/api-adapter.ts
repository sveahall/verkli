import { candidateBaseUrl, candidateSchema, scopeKeySchema, snapshotSchema, type CandidateAdapter, type CandidateScopeKey, type SavedCandidate } from "./contracts";

export function createCandidateAdapter(ownerId: string, key: CandidateScopeKey): CandidateAdapter {
  const scope = scopeKeySchema.parse(key);
  const base = candidateBaseUrl(scope);
  function checkedImage(candidate: SavedCandidate) {
    if (candidate.imageUrl !== `${base}/${candidate.id}/image`) throw new Error("The image response did not match this chapter. Reload and try again.");
    return candidate;
  }
  async function responseJson(response: Response) {
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: "Check the image and description, then try again.", 401: "Sign in again to save this candidate.", 403: "An approved author account is required.",
        404: "This chapter is unavailable in your account.", 409: "The chapter or request changed. Reload the candidates and review your proposal.",
        413: "Choose a PNG or JPEG up to 10 MB.", 503: "Private image storage is unavailable. Your local proposal is still here; retry when it is available.",
      };
      throw new Error(messages[response.status] ?? "Could not confirm the save. Keep this proposal and retry the same request.");
    }
    return response.json();
  }
  return {
    contextId: `${ownerId}:${scope.bookId}:${scope.editionId}:${scope.chapterId}`,
    async list(signal) {
      const snapshot = snapshotSchema.parse(await responseJson(await fetch(base, { signal, credentials: "same-origin", cache: "no-store" })));
      if (snapshot.scope.bookId !== scope.bookId || snapshot.scope.editionId !== scope.editionId || snapshot.scope.chapterId !== scope.chapterId) throw new Error("The response did not match this chapter. Reload and try again.");
      snapshot.candidates.forEach(checkedImage);
      return snapshot;
    },
    async save(intent, file, signal) {
      const body = new FormData(); body.set("intent", JSON.stringify(intent)); body.set("file", file);
      const candidate = checkedImage(candidateSchema.parse(await responseJson(await fetch(base, { method: "POST", body, signal, credentials: "same-origin", cache: "no-store" }))));
      if (candidate.id !== intent.requestId) throw new Error("Could not confirm this request. Keep your proposal and retry.");
      return candidate;
    },
  };
}
