-- Migration: Inyectar rls_tier en JWT + role_name + drop CHECK constraint
-- Fecha: 2026-06-20
-- Descripción: Permite roles custom (ej: "gerente") con tier de RLS
--              (ej: owner). El JWT recibe:
--                role = rls_tier     → para RLS policies y requireRole()
--                role_name = nombre  → para display en UI
--                permissions[]       → permisos granulares (sin cambios)
--
-- Comportamiento:
--   admin  (rls_tier=admin)   → JWT.role = 'admin',   JWT.role_name = 'admin'
--   owner  (rls_tier=owner)   → JWT.role = 'owner',   JWT.role_name = 'owner'
--   employee (rls_tier=employee) → JWT.role = 'employee', JWT.role_name = 'employee'
--   gerente (rls_tier=owner)  → JWT.role = 'owner',   JWT.role_name = 'gerente'
--   cajero (rls_tier=employee) → JWT.role = 'employee', JWT.role_name = 'cajero'

-- ============================================================
-- 1. Drop CHECK constraint legacy de user_roles.role
-- ============================================================
-- Ya no sirve porque los roles custom no se llaman admin/owner/employee.
ALTER TABLE IF EXISTS public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_valid;

-- ============================================================
-- 2. Actualizar custom_access_token_hook
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_role text;
    v_rls_tier text;
    v_tenant_id uuid;
    v_permissions text[];
    v_user_id uuid;
BEGIN
    v_user_id := (event->>'user_id')::uuid;

    SELECT ur.role, ur.tenant_id INTO v_role, v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.deleted_at IS NULL
    ORDER BY (CASE WHEN ur.role = 'admin' THEN 1 WHEN ur.role = 'owner' THEN 2 ELSE 3 END) ASC
    LIMIT 1;

    IF FOUND THEN
        -- rls_tier: el tier real para RLS policies y requireRole()
        -- Si el rol no existe en la tabla roles (fallback), usa el nombre como tier
        SELECT COALESCE(
            (SELECT rls_tier FROM public.roles WHERE name = v_role AND deleted_at IS NULL),
            v_role
        ) INTO v_rls_tier;

        -- role = rls_tier (para compatibilidad con RLS policies existentes)
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_rls_tier));

        -- role_name = nombre real del rol (para display en UI)
        event := jsonb_set(event, '{claims, app_metadata, role_name}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(event, '{claims, app_metadata, tenant_id}', to_jsonb(v_tenant_id::text));
        END IF;

        -- Build permissions array from role_permissions table (usa el nombre del rol)
        SELECT array_agg(rp.permission ORDER BY rp.permission)
        INTO v_permissions
        FROM public.role_permissions rp
        JOIN public.roles r ON r.id = rp.role_id
        WHERE r.name = v_role AND r.deleted_at IS NULL;

        -- Apply allow overrides
        WITH allow_ovr AS (
            SELECT permission FROM public.user_permission_overrides
            WHERE user_id = v_user_id
              AND tenant_id = v_tenant_id
              AND effect = 'allow'
        )
        SELECT array_agg(DISTINCT p ORDER BY p)
        INTO v_permissions
        FROM (
            SELECT unnest(v_permissions) AS p
            UNION
            SELECT permission FROM allow_ovr
        ) sub;

        -- Apply deny overrides
        SELECT array_agg(p ORDER BY p)
        INTO v_permissions
        FROM (
            SELECT unnest(v_permissions) AS p
            EXCEPT
            SELECT permission FROM public.user_permission_overrides
            WHERE user_id = v_user_id
              AND tenant_id = v_tenant_id
              AND effect = 'deny'
        ) sub;

        event := jsonb_set(
            event,
            '{claims, app_metadata, permissions}',
            to_jsonb(COALESCE(v_permissions, ARRAY[]::text[]))
        );
    END IF;

    RETURN event;
END;
$$;
