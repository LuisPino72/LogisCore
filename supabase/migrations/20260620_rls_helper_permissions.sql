-- Migration: Helper function has_permission() + documentación matriz tabla→módulo
-- Fecha: 2026-06-20
-- Descripción: Función helper para chequear permisos desde RLS policies.
--              No modifica policies existentes — es base para políticas futuras.
--
-- Uso en RLS policies (futuro):
--   CREATE POLICY products_employee_select ON public.products
--     FOR SELECT TO authenticated
--     USING (
--       public.has_permission('inventory:read')
--       AND tenant_id = (...)
--     );
--
-- Nota: El sistema actual usa RLS por rol (admin/owner/employee via rls_tier),
--       no por permiso granular. Los permisos se validan en frontend.
--       Ver docs/architecture/rls-permission-matrix.md para la matriz completa.

-- ============================================================
-- 1. Función helper: has_permission(required_permission)
-- ============================================================
-- Retorna true si el usuario autenticado tiene el permiso en su JWT.
-- Admin bypass: si permissions[] es null (admin no está en user_roles),
--               retorna true para todo.
-- Útil para: RLS policies, Edge Functions, checks en backend.

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_permissions jsonb;
BEGIN
    v_permissions := (auth.jwt() -> 'app_metadata' -> 'permissions');

    -- Null permissions → admin bypass → todo permitido
    IF v_permissions IS NULL THEN
        RETURN true;
    END IF;

    RETURN v_permissions @> to_jsonb(ARRAY[required_permission]);
END;
$$;
