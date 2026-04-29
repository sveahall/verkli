-- ---------------------------------------------------------------------------
-- Sprint 0.5 — Audit log foundation (Task 3).
--
-- A single denormalised audit_log table for compliance + incident forensics.
-- Mutations write here via lib/audit.ts:recordAudit(). The before/after
-- payloads are JSONB so rows stay immutable history without joining back to
-- mutable parent tables.
--
-- RLS:
--   - INSERT: only via SECURITY DEFINER helper (callers don't INSERT directly).
--   - SELECT: admins only (service role bypasses RLS regardless).
--   - UPDATE / DELETE: never. Audit rows are append-only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id     UUID NULL,
  actor_role   TEXT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    UUID NULL,
  before       JSONB NULL,
  after        JSONB NULL,
  metadata     JSONB NULL,
  CONSTRAINT audit_log_action_check
    CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log (actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON public.audit_log (target_type, target_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_action_idx
  ON public.audit_log (action, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- No PERMISSIVE policies for INSERT / UPDATE / DELETE — only the service role
-- (which bypasses RLS) can write. The application calls the SECURITY DEFINER
-- helper below, which runs with elevated privileges.

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- SECURITY DEFINER helper: the only sanctioned write path from app code.
-- Application invokes via supabase.rpc('record_audit', {...}). The function
-- runs as the table owner so RLS does not block the INSERT, and it captures
-- auth.uid() as the actor automatically when not supplied.
CREATE OR REPLACE FUNCTION public.record_audit(
  p_action       TEXT,
  p_target_type  TEXT,
  p_target_id    UUID DEFAULT NULL,
  p_before       JSONB DEFAULT NULL,
  p_after        JSONB DEFAULT NULL,
  p_metadata     JSONB DEFAULT NULL,
  p_actor_id     UUID DEFAULT NULL,
  p_actor_role   TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := COALESCE(p_actor_id, auth.uid());
  v_role  TEXT := p_actor_role;
  v_id    BIGINT;
BEGIN
  IF v_role IS NULL AND v_actor IS NOT NULL THEN
    SELECT lower(role) INTO v_role
      FROM public.profiles
     WHERE user_id = v_actor
     LIMIT 1;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action, target_type, target_id,
    before, after, metadata
  )
  VALUES (
    v_actor, v_role, p_action, p_target_type, p_target_id,
    p_before, p_after, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit(
  TEXT, TEXT, UUID, JSONB, JSONB, JSONB, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_audit(
  TEXT, TEXT, UUID, JSONB, JSONB, JSONB, UUID, TEXT
) TO authenticated, service_role;
