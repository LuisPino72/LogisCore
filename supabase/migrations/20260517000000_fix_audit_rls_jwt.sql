-- Fix: audit_trail RLS policies ahora leen role desde app_metadata del JWT
-- El top-level claim 'role' fue eliminado (causaba conflictos con PostgREST)
-- El role ahora solo está en JWT.app_metadata.role

-- Reemplazar policies de audit_trail para usar app_metadata
DROP POLICY IF EXISTS "audit_trail_admin_select" ON public.audit_trail;
CREATE POLICY "audit_trail_admin_select" ON public.audit_trail
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "audit_trail_service_insert" ON public.audit_trail;
CREATE POLICY "audit_trail_service_insert" ON public.audit_trail
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'owner', 'employee')
        AND ur.deleted_at IS NULL
    )
  );
