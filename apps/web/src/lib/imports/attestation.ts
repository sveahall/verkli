import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { auditMetadataFromRequest, recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_RIGHTS_ATTESTATION_REQUIRED,
  E_RIGHTS_ATTESTATION_INCOMPLETE,
  E_RIGHTS_ATTESTATION_NOT_RECORDED,
} from "@/lib/api-errors";

/**
 * Rights attestation for an uploaded manuscript.
 *
 * The gate's value is the RECORD, not the checkbox. A gate that collects an
 * attestation and does not durably store it is worse than no gate: it
 * manufactures the appearance of diligence without the substance. So the parser
 * below is strict, the writer is service-role and blocking, and the exact
 * wording shown to the author is stored alongside the answers.
 *
 * Scope, stated plainly because it is easy to overclaim: this covers uploading a
 * manuscript FILE. It does not cover pasting text into the editor, which writes
 * from the browser straight to Supabase with no server route to gate
 * (`editor/hooks/useChapterCrud.ts`). Do not describe this as "authors must
 * attest before a manuscript enters Verkli".
 */

/**
 * Bump on every wording change. Stored per row so an old attestation keeps the
 * text it was actually given, and a later, stronger wording does not
 * retroactively claim to have been agreed.
 */
export const RIGHTS_WORDING_VERSION = "2026-09-04.1";

/**
 * The sentences shown to the author, verbatim, in one place.
 *
 * English on purpose. `scripts/check-english-default.ts` covers
 * `app/(app-author)` but not `components/import`, so a Swedish version would
 * pass CI in exactly half the files it applies to — and a warranty whose
 * translation can drift is worse than one that exists in a single language.
 * Deliberately NOT in `messages/*.json` for the same reason.
 */
export const RIGHTS_WORDING = {
  holdsRights:
    "I hold the rights to this manuscript, and uploading it does not infringe anyone else's copyright.",
  isOwnWork: "I wrote this text myself. Using AI tools to help is fine.",
  previouslyPublished: "Has this text been published before?",
  consequences:
    "I understand that a false statement here may end this project or close my account.",
} as const;

/** Keeps the free-text disclosure from becoming an unbounded write. */
export const PRIOR_PUBLICATION_DETAIL_MAX = 2000;

export interface RightsAttestationInput {
  holdsRights: boolean;
  isOwnWork: boolean;
  consequencesAcknowledged: boolean;
  previouslyPublished: boolean;
  priorPublicationDetail: string | null;
}

export type AttestationParseFailure =
  | "missing"
  | "not_affirmed"
  | "publication_answer_missing"
  | "publication_detail_missing"
  | "publication_detail_too_long";

export type AttestationParseResult =
  | { ok: true; value: RightsAttestationInput }
  | { ok: false; reason: AttestationParseFailure };

/**
 * Exactly the string "true". Nothing else.
 *
 * This inverts the leniency of the neighbouring `parseImportMode`, which turns
 * an absent value into a valid default (`scoped-import.ts`: `rawMode === "" ?
 * "new_version" : null`). Copying that habit here would void the gate — an
 * omitted checkbox would read as agreement, which is the one thing an
 * attestation must never do.
 */
function isAffirmed(value: FormDataEntryValue | null): boolean {
  return value === "true";
}

/** Present and non-empty, or null. */
function readText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse and validate the attestation fields from an import request.
 *
 * Returns a reason rather than throwing so the route can map it to one error
 * key. Every failure mode is a refusal: there is no partial acceptance and no
 * default.
 */
export function readRightsAttestation(formData: FormData): AttestationParseResult {
  const holdsRights = isAffirmed(formData.get("attestHoldsRights"));
  const isOwnWork = isAffirmed(formData.get("attestIsOwnWork"));
  const consequencesAcknowledged = isAffirmed(formData.get("attestConsequences"));

  // Nothing sent at all — an older client, or a direct API call that skipped
  // the form. Distinguished from a partial answer so the message can differ.
  if (
    formData.get("attestHoldsRights") === null &&
    formData.get("attestIsOwnWork") === null &&
    formData.get("attestConsequences") === null &&
    formData.get("attestPreviouslyPublished") === null
  ) {
    return { ok: false, reason: "missing" };
  }

  if (!holdsRights || !isOwnWork || !consequencesAcknowledged) {
    return { ok: false, reason: "not_affirmed" };
  }

  // A real yes/no, not a checkbox. Omission is not "no": an author who never
  // answered has not disclosed anything, and recording that as "not previously
  // published" would be us inventing an assertion they did not make.
  const rawPublished = formData.get("attestPreviouslyPublished");
  if (rawPublished !== "yes" && rawPublished !== "no") {
    return { ok: false, reason: "publication_answer_missing" };
  }
  const previouslyPublished = rawPublished === "yes";

  const priorPublicationDetail = readText(formData.get("attestPriorPublicationDetail"));
  if (previouslyPublished && priorPublicationDetail === null) {
    return { ok: false, reason: "publication_detail_missing" };
  }
  if (
    priorPublicationDetail !== null &&
    priorPublicationDetail.length > PRIOR_PUBLICATION_DETAIL_MAX
  ) {
    return { ok: false, reason: "publication_detail_too_long" };
  }

  return {
    ok: true,
    value: {
      holdsRights,
      isOwnWork,
      consequencesAcknowledged,
      previouslyPublished,
      // Only meaningful when the answer was yes. Dropped otherwise so a stale
      // textarea value cannot end up attached to a "no".
      priorPublicationDetail: previouslyPublished ? priorPublicationDetail : null,
    },
  };
}

export interface WriteRightsAttestationArgs {
  /** MUST be a service-role client. The table has no INSERT policy. */
  admin: SupabaseClient;
  request: Request;
  userId: string;
  bookId: string | null;
  fileName: string | null;
  attestation: RightsAttestationInput;
}

export type WriteRightsAttestationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Record the attestation. Blocking, and the caller must refuse the import if
 * this fails.
 *
 * The admin client is not an optimisation. `book_rights_attestations` has RLS on
 * with a SELECT-own policy and deliberately no INSERT policy, so an author
 * cannot forge, edit or delete what they signed. Passing a session client here
 * would have the insert silently rejected — which is the trap `recordAudit`
 * falls into by design, since it returns null on failure.
 */
export async function writeRightsAttestation({
  admin,
  request,
  userId,
  bookId,
  fileName,
  attestation,
}: WriteRightsAttestationArgs): Promise<WriteRightsAttestationResult> {
  const metadata = auditMetadataFromRequest(request);
  const requestId =
    typeof metadata?.request_id === "string" ? metadata.request_id : null;
  const userAgent =
    typeof metadata?.user_agent === "string" ? metadata.user_agent : null;

  const { data, error } = await admin
    .from("book_rights_attestations")
    .insert({
      user_id: userId,
      book_id: bookId,
      wording_version: RIGHTS_WORDING_VERSION,
      // The text, not just the version. A version alone is a pointer into a git
      // history nobody will reconstruct during a dispute.
      shown_wording: RIGHTS_WORDING,
      holds_rights: attestation.holdsRights,
      is_own_work: attestation.isOwnWork,
      consequences_acknowledged: attestation.consequencesAcknowledged,
      previously_published: attestation.previouslyPublished,
      prior_publication_detail: attestation.priorPublicationDetail,
      file_name: fileName,
      ip: getClientIpFromRequest(request),
      user_agent: userAgent,
      request_id: requestId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[imports/attestation] write failed", {
      userId,
      bookId,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: false, error: "attestation insert returned no row" };
  }
  return { ok: true, id: data.id };
}

/** Which error key a parse failure maps to. */
function errorKeyFor(reason: AttestationParseFailure): string {
  switch (reason) {
    case "missing":
    case "not_affirmed":
      return E_RIGHTS_ATTESTATION_REQUIRED;
    default:
      return E_RIGHTS_ATTESTATION_INCOMPLETE;
  }
}

export interface EnforceRightsAttestationArgs {
  request: Request;
  formData: FormData;
  userId: string;
  /** Null on the legacy path, where the worker creates the book afterwards. */
  bookId: string | null;
  file: File;
}

/**
 * The gate. Returns a Response to return immediately, or null to proceed.
 *
 * ONE definition, called from both import routes. Duplicating it is the failure
 * this codebase has already had once today: the waitlist and beta middleware
 * locks each kept their own allowlist, one was taught about a path and the other
 * never was, and the result was a page that rendered with a dead buy button.
 *
 * Call it after the file has been validated and BEFORE anything is persisted —
 * no storage write, no `book_imports` row, no enqueue. If the record cannot be
 * written the import must not happen, because an attestation that is collected
 * and lost is worse than none: it manufactures the appearance of diligence.
 */
export async function enforceRightsAttestation({
  request,
  formData,
  userId,
  bookId,
  file,
}: EnforceRightsAttestationArgs): Promise<Response | null> {
  const parsed = readRightsAttestation(formData);
  if (!parsed.ok) {
    return apiError(errorKeyFor(parsed.reason), 400, { detail: parsed.reason });
  }

  // Service-role deliberately: the table has no INSERT policy, so a session
  // client would have this silently rejected by RLS. That is the trap to avoid
  // here — it would pass in dev and record nothing.
  const admin = createAdminClient();

  const written = await writeRightsAttestation({
    admin,
    request,
    userId,
    bookId,
    fileName: file.name,
    attestation: parsed.value,
  });

  if (!written.ok) {
    return apiError(E_RIGHTS_ATTESTATION_NOT_RECORDED, 500);
  }

  // Mirror into the timeline. Fire-and-forget on purpose: `recordAudit` returns
  // null on failure by design, so it can never be the durable record — the row
  // above already is. A missing mirror must not fail an import that was
  // properly attested.
  void recordAudit(admin, {
    action: "book.rights_attested",
    target: { type: "book", id: bookId },
    actor: { id: userId },
    metadata: {
      ...auditMetadataFromRequest(request),
      attestation_id: written.id,
      wording_version: RIGHTS_WORDING_VERSION,
      previously_published: parsed.value.previouslyPublished,
      file_name: file.name,
    },
  });

  return null;
}
