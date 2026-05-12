-- Fix: audit_trail INSERT policy simplificada para usuarios autenticados
-- El policy anterior dependía de JWT.app_metadata.role, que requiere
-- custom_access_token_hook activo en el dashboard de Supabase.
-- Esta versión usa user_roles (siempre disponible) + JWT como fallback.

DROP POLICY IF EXISTS "audit_trail_service_insert" ON public.audit_trail;
DROP POLICY IF EXISTS "audit_trail_insert_authenticated" ON public.audit_trail;

CREATE POLICY "audit_trail_insert_authenticated" ON public.audit_trail
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.deleted_at IS NULL
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT NULL
  );

DROP POLICY IF EXISTS "audit_trail_no_update" ON public.audit_trail;
CREATE POLICY "audit_trail_no_update" ON public.audit_trail
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "audit_trail_no_delete" ON public.audit_trail;
CREATE POLICY "audit_trail_no_delete" ON public.audit_trail
  FOR DELETE
  USING (false);
