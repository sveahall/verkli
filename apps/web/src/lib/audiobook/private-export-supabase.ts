import "server-only";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { loadPrivateExportSnapshot } from "./full-book-export-source";
export { loadPrivateExportSnapshot } from "./full-book-export-source";
import { PRIVATE_EXPORT_LIMITS, PrivateExportError } from "./private-export-contract";
import type { PrivateExportDependencies } from "./private-export-service";

const limiter = createPerUserRateLimiter({ name: "audiobook-private-export", maxPerMinute: 2 });
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const objectPath = new RegExp(`^cache/${uuid}/${uuid}-[a-f0-9]{16}\\.(mp3|wav)(\\.timing\\.json)?$`);
function unavailable(): never {
  throw new PrivateExportError(422, "SOURCE_UNVERIFIED", "This edition does not have complete, verifiable existing audio within the export limits. No audio was generated.");
}

/** No clients are created until a request invokes these dependencies. All metadata uses session RLS plus explicit ownership filters. */
export function createPrivateExportDependencies(): PrivateExportDependencies {
  return {
    async authorize(signal) {
      signal.throwIfAborted();
      const { user, response } = await requireAuthorRoleForApi();
      signal.throwIfAborted();
      if (response || !user) throw new PrivateExportError(response?.status ?? 401, "AUTHOR_AUTH_REQUIRED", "Sign in with author access to export your existing audio.");
      return user.id;
    },
    async rateLimit(ownerId) { return (await limiter.check(ownerId)).allowed; },
    async snapshot(ownerId, bookId, editionId, signal) {
      return loadPrivateExportSnapshot(await createClient(), ownerId, bookId, editionId, signal);
    },
    async readObject(path, maxBytes, signal) {
      signal.throwIfAborted();
      if (!objectPath.test(path) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > PRIVATE_EXPORT_LIMITS.sourceBytes) unavailable();
      // Service calls this only after validating the owned edition, canonical paths and snapshot identity.
      // No signed/public URL or client-chosen bucket is accepted.
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const abort = () => { void reader?.cancel().catch(() => undefined); };
      try {
        const { data, error } = await createAdminClient().storage.from(getAudiobookStorageBucket())
          .download(path, {}, { signal, cache: "no-store", redirect: "error" }).asStream();
        if (error || !data) throw new PrivateExportError(503, "SOURCE_READ_FAILED", "Could not read verified existing audio. Try again shortly.");
        reader = data.getReader(); signal.addEventListener("abort", abort, { once: true });
        signal.throwIfAborted();
        const chunks: Buffer[] = []; let total = 0;
        while (true) {
          signal.throwIfAborted();
          const { value, done } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) throw new PrivateExportError(413, "SOURCE_TOO_LARGE", "Existing audio exceeds this export's source size limit.");
          chunks.push(Buffer.from(value));
        }
        if (!total) unavailable();
        return Buffer.concat(chunks, total);
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof PrivateExportError) throw error;
        console.error("[audiobook export] private source read failed");
        throw new PrivateExportError(503, "SOURCE_READ_FAILED", "Could not read verified existing audio. Try again shortly.");
      } finally {
        signal.removeEventListener("abort", abort);
        if (reader) { try { await reader.cancel(); } catch { /* Keep the original error. */ } reader.releaseLock(); }
      }
    },
  };
}
