-- Approved by the project owner on 2026-09-18 after DATABASE-APPROVAL.md.
-- Reviewed source bodies below are preserved verbatim, including their historical
-- proposal-only comments. Run the complete migration in one transaction.
-- DRAFT ONLY. Not a canonical migration. Requires explicit schema approval.
-- V2: deletion/revision/membership fences + atomic ledger + idempotent replay.
-- Caller: trusted translation worker with existing service-role client.
-- Deployment prerequisite: translation_quality ai_jobs rows must be service-write-only.
CREATE OR REPLACE FUNCTION public.commit_reviewed_translation(
  p_book_id uuid,
  p_author_id uuid,
  p_source_version_id uuid,
  p_target_version_id uuid,
  p_claim_marker text,
  p_claim_revision timestamptz,
  p_expected_source jsonb,
  p_expected_target jsonb,
  p_chapters jsonb,
  p_scope text,
  p_overwrite boolean,
  p_source_revision timestamptz,
  p_job_id uuid,
  p_job_revision timestamptz,
  p_final_report jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
SET timezone = 'UTC'
AS $function$
DECLARE
  target public.book_versions%ROWTYPE;
  chapter_order integer;
  saved_count integer := 0;
  affected_count integer;
  expected_deleted_count integer;
  job public.ai_jobs%ROWTYPE;
  request_digest text;
  receipt jsonb;
BEGIN
  IF p_source_version_id = p_target_version_id
     OR p_scope NOT IN ('book', 'chapter')
     OR p_scope IS NULL
     OR p_claim_marker IS NULL
     OR p_job_id IS NULL
     OR p_claim_marker IS DISTINCT FROM 'translation-claim:' || p_job_id::text
     OR p_source_revision IS NULL
     OR p_job_revision IS NULL
     OR jsonb_typeof(p_final_report) IS DISTINCT FROM 'object'
     OR p_claim_revision IS NULL
     OR jsonb_typeof(p_expected_source) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_expected_target) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_chapters) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid translation save contract';
  END IF;
  IF jsonb_array_length(p_expected_source) = 0
     OR jsonb_array_length(p_chapters) <> jsonb_array_length(p_expected_source)
     OR (p_scope = 'chapter' AND jsonb_array_length(p_expected_source) <> 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid translation chapter membership';
  END IF;
  PERFORM b.id FROM public.books b WHERE b.id = p_book_id AND b.author_id = p_author_id AND b.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Translation owner mismatch';
  END IF;

  -- Fixed order avoids deadlock between reverse-direction jobs. FOR UPDATE
  -- also blocks FK inserts into these versions until the transaction commits.
  PERFORM v.id FROM public.book_versions v
    WHERE v.book_id = p_book_id AND v.id IN (p_source_version_id, p_target_version_id)
    ORDER BY v.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.book_versions WHERE id = p_source_version_id AND book_id = p_book_id) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation source version changed';
  END IF;
  -- Parent locks always precede ledger locks, including recovery/terminal writers.
  SELECT * INTO job FROM public.ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR job.user_id IS DISTINCT FROM p_author_id
     OR job.book_id IS DISTINCT FROM p_book_id
     OR job.book_version_id IS DISTINCT FROM p_target_version_id
     OR job.kind IS DISTINCT FROM 'translation_quality'
     OR job.input->>'targetClaimMarker' IS DISTINCT FROM p_claim_marker
     OR job.input->>'sourceVersionId' IS DISTINCT FROM p_source_version_id::text
     OR job.input->>'scope' IS DISTINCT FROM p_scope THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation job ownership changed';
  END IF;
  request_digest := encode(sha256(convert_to(jsonb_build_array(
    p_book_id, p_author_id, p_source_version_id, p_target_version_id,
    p_claim_marker, p_claim_revision, p_expected_source, p_expected_target,
    p_chapters, p_scope, p_overwrite, p_source_revision, p_job_id,
    p_job_revision, p_final_report
  )::text, 'UTF8')), 'hex');
  IF job.status = 'completed' THEN
    IF job.output->>'status' = 'checks_passed'
       AND job.output->'_translationCommit'->>'requestDigest' = request_digest
       AND jsonb_typeof(job.output->'_translationCommit'->'receipt') = 'object' THEN
      RETURN (job.output->'_translationCommit'->'receipt') || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Completed translation job does not match this save';
  END IF;
  IF job.status IS DISTINCT FROM 'processing' OR job.updated_at IS DISTINCT FROM p_job_revision
     OR job.output->>'status' IS DISTINCT FROM 'processing'
     OR p_final_report->>'status' IS DISTINCT FROM 'checks_passed'
     OR p_final_report->>'sourceVersionId' IS DISTINCT FROM p_source_version_id::text
     OR p_final_report->>'targetVersionId' IS DISTINCT FROM p_target_version_id::text
     OR p_final_report->>'scope' IS DISTINCT FROM p_scope
     OR p_final_report->>'sourceHash' IS DISTINCT FROM job.input->>'sourceHash'
     OR coalesce(p_final_report->>'targetHash', '') = ''
     OR p_final_report ? '_translationCommit'
     OR jsonb_typeof(p_final_report->'usageReceipts') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_final_report->'batches') IS DISTINCT FROM 'array'
     OR (p_final_report - ARRAY['status','checkedAt','targetHash'])
        IS DISTINCT FROM (job.output - ARRAY['status','checkedAt','targetHash']) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation report or receipts changed; no chapters saved';
  END IF;
  IF jsonb_array_length(p_final_report->'batches') = 0
     OR jsonb_array_length(p_final_report->'usageReceipts') = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translation review evidence is empty';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_final_report->'batches') b
             WHERE b->'report'->>'status' IS DISTINCT FROM 'checks_passed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translation has unresolved review batches';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.book_versions WHERE id = p_source_version_id
                 AND book_id = p_book_id AND updated_at = p_source_revision) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation source version changed';
  END IF;
  SELECT * INTO target FROM public.book_versions WHERE id = p_target_version_id AND book_id = p_book_id;
  IF NOT FOUND OR target.status <> 'translating' OR target.published_at IS NOT NULL
     OR target.error_message IS DISTINCT FROM p_claim_marker
     OR target.updated_at IS DISTINCT FROM p_claim_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation claim changed; no chapters saved';
  END IF;
  chapter_order := (p_expected_source->0->>'order')::integer;

  -- Lock both memberships, not just rows selected by order, before comparing.
  -- Deletes, edits, reorders, moves and duplicate-order insertions either finish
  -- before this snapshot check or wait until the complete save has committed.
  PERFORM c.id FROM public.chapters c
    WHERE c.book_version_id IN (p_source_version_id, p_target_version_id)
    ORDER BY c.id FOR UPDATE;

  -- Do not hide corrupt membership behind the caller's book filter.
  IF EXISTS (SELECT 1 FROM public.chapters WHERE book_version_id IN (p_source_version_id, p_target_version_id)
             AND book_id IS DISTINCT FROM p_book_id) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Chapter book/version membership is inconsistent';
  END IF;
  -- Tombstones are retained. Never translate into, resurrect, or prune one.
  IF EXISTS (SELECT 1 FROM public.chapters WHERE book_version_id = p_target_version_id
             AND deleted_at IS NOT NULL AND (p_scope = 'book' OR "order" = chapter_order)) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Target contains deleted chapters; reconcile the edition before translating';
  END IF;

  IF EXISTS (
    WITH expected AS (
      SELECT * FROM jsonb_to_recordset(p_expected_source) AS e(id uuid, title text, content text, "order" integer, updated_at timestamptz, version_number integer, deleted_at timestamptz)
    ), actual AS (
      SELECT id, title, content, "order", updated_at, version_number, deleted_at FROM public.chapters
      WHERE book_id = p_book_id AND book_version_id = p_source_version_id AND deleted_at IS NULL
        AND (p_scope = 'book' OR id = (p_expected_source->0->>'id')::uuid)
    )
    SELECT 1 FROM ((TABLE expected EXCEPT TABLE actual) UNION ALL (TABLE actual EXCEPT TABLE expected)) difference
  ) OR (SELECT count(DISTINCT e.id) FROM jsonb_to_recordset(p_expected_source) AS e(id uuid)) <> jsonb_array_length(p_expected_source) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Source manuscript changed; no chapters saved';
  END IF;

  IF EXISTS (
    WITH expected AS (
      SELECT * FROM jsonb_to_recordset(p_expected_target) AS e(id uuid, title text, content text, "order" integer, updated_at timestamptz, version_number integer, deleted_at timestamptz)
    ), actual AS (
      SELECT id, title, content, "order", updated_at, version_number, deleted_at FROM public.chapters
      WHERE book_id = p_book_id AND book_version_id = p_target_version_id AND deleted_at IS NULL
        AND (p_scope = 'book' OR "order" = chapter_order)
    )
    SELECT 1 FROM ((TABLE expected EXCEPT TABLE actual) UNION ALL (TABLE actual EXCEPT TABLE expected)) difference
  ) OR (SELECT count(DISTINCT e.id) FROM jsonb_to_recordset(p_expected_target) AS e(id uuid)) <> jsonb_array_length(p_expected_target) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Target manuscript changed; newer text kept';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_chapters) AS n(title text, content text, "order" integer)
    WHERE n.title IS NULL OR n.content IS NULL OR n."order" IS NULL OR n."order" < 0
      OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_expected_source) AS s("order" integer) WHERE s."order" = n."order")
  ) OR (SELECT count(DISTINCT n."order") FROM jsonb_to_recordset(p_chapters) AS n("order" integer)) <> jsonb_array_length(p_chapters) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Translated chapter order does not match the source';
  END IF;

  IF p_scope = 'book' AND p_overwrite IS NOT TRUE AND EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_expected_target) AS e("order" integer)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_chapters) AS n("order" integer) WHERE n."order" = e."order")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Target has extra chapters; review overwrite scope before retrying';
  END IF;

  UPDATE public.chapters c SET title = n.title, content = n.content,
    source_text = n.source_text, content_hash = n.content_hash
  FROM jsonb_to_recordset(p_chapters) AS n(title text, content text, source_text text, content_hash text, "order" integer)
  WHERE c.book_id = p_book_id AND c.book_version_id = p_target_version_id AND c.deleted_at IS NULL AND c."order" = n."order";
  GET DIAGNOSTICS saved_count = ROW_COUNT;

  INSERT INTO public.chapters(book_id, book_version_id, title, content, source_text, content_hash, "order")
  SELECT p_book_id, p_target_version_id, n.title, n.content, n.source_text, n.content_hash, n."order"
  FROM jsonb_to_recordset(p_chapters) AS n(title text, content text, source_text text, content_hash text, "order" integer)
  WHERE NOT EXISTS (SELECT 1 FROM public.chapters c WHERE c.book_version_id = p_target_version_id AND c."order" = n."order");
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  saved_count := saved_count + affected_count;
  IF saved_count <> jsonb_array_length(p_chapters) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Saved chapter count differs from reviewed payload';
  END IF;

  -- Only explicit whole-book overwrite may remove pre-existing extra rows.
  -- Exact membership/revision comparison above guarantees no new/edited row
  -- can be deleted. Any failure rolls back all inserts/updates/deletes.
  IF p_scope = 'book' AND p_overwrite IS TRUE THEN
    SELECT count(*) INTO expected_deleted_count FROM jsonb_to_recordset(p_expected_target) AS e("order" integer)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_chapters) AS n("order" integer) WHERE n."order" = e."order");
    DELETE FROM public.chapters c
    WHERE c.book_id = p_book_id AND c.book_version_id = p_target_version_id
      AND c.deleted_at IS NULL AND c.id IN (SELECT e.id FROM jsonb_to_recordset(p_expected_target) AS e(id uuid))
      AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_chapters) AS n("order" integer) WHERE n."order" = c."order");
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count <> expected_deleted_count THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Overwrite deletion count changed';
    END IF;
  END IF;

  UPDATE public.book_versions SET status = CASE WHEN p_scope = 'chapter' THEN 'draft' ELSE 'done' END,
    error_message = NULL WHERE id = p_target_version_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Edition completion failed; save rolled back';
  END IF;
  SELECT * INTO target FROM public.book_versions WHERE id = p_target_version_id;
  receipt := jsonb_build_object('jobId', p_job_id, 'versionId', target.id,
    'updatedAt', target.updated_at, 'savedChapters', saved_count, 'replayed', false);
  UPDATE public.ai_jobs SET status = 'completed', progress = 100, error = NULL,
    finished_at = now(), output = p_final_report || jsonb_build_object('_translationCommit',
      jsonb_build_object('requestDigest', request_digest, 'receipt', receipt))
    WHERE id = p_job_id AND status = 'processing' AND updated_at = p_job_revision;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Translation receipt completion failed; save rolled back';
  END IF;
  RETURN receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_reviewed_translation(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, boolean, timestamptz, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reviewed_translation(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, boolean, timestamptz, uuid, timestamptz, jsonb) TO service_role;
