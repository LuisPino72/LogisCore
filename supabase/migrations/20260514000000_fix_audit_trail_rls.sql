-- Fix: Fortalecer RLS de audit_trail para permitir admin bypass
-- El admin (Luis) debe poder leer la tabla audit_trail sin necesidad de un registro en user_roles
-- 
-- Motivación:
-- 1. El admin no siempre tiene un registro en public.user_roles (ej. usuarios inyectados post-seed)
-- 2. auth.jwt() ->> 'app_metadata' ->> 'role' retorna 'admin' para el admin
-- 3. La política SELECT anterior solo permitía service_role o user_roles.admin

-- Actualizar política SELECT para incluir admin por JWT
DROP POLICY IF EXISTS "audit_trail_admin_select" ON public.audit_trail;
CREATE POLICY "audit_trail_admin_select" ON public.audit_trail
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'role' = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.deleted_at IS NULL
    )
  );

-- Actualizar política INSERT para permitir anon/apikey con JWT admin  
DROP POLICY IF EXISTS "audit_trail_service_insert" ON public.audit_trail;
CREATE POLICY "audit_trail_service_insert" ON public.audit_trail
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'role' = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'owner', 'employee')
        AND ur.deleted_at IS NULL
    )
  );
