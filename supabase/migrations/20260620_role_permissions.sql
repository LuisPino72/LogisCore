-- Migration: RBAC Granular - Tablas de roles, permisos y overrides
-- Fecha: 2026-06-20
-- Descripción: Sistema de permisos granulares con formato module:action.
--              Reemplaza los 3 roles hardcodeados por roles configurables.
--
-- Tablas nuevas:
--   roles: define los tipos de usuario (admin, owner, employee + custom)
--   role_permissions: qué acciones tiene cada rol
--   user_permission_overrides: excepciones por usuario (allow/deny)
--
-- Seed: 3 roles del sistema con permisos equivalentes al sistema actual.
--
-- Hook actualizado: custom_access_token_hook inyecta permissions[] en JWT.

-- ============================================================
-- 1. Tabla: roles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    rls_tier text NOT NULL DEFAULT 'employee' CHECK (rls_tier IN ('admin', 'owner', 'employee')),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_unique ON public.roles (name) WHERE deleted_at IS NULL;

-- ============================================================
-- 2. Tabla: role_permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_unique ON public.role_permissions (role_id, permission);

-- ============================================================
-- 3. Tabla: user_permission_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    permission text NOT NULL,
    effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permission_overrides_unique ON public.user_permission_overrides (user_id, tenant_id, permission);

-- ============================================================
-- 4. RLS Policies
-- ============================================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Admin: ALL on everything
CREATE POLICY roles_admin_all ON public.roles
    FOR ALL TO authenticated
    USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin');

CREATE POLICY role_permissions_admin_all ON public.role_permissions
    FOR ALL TO authenticated
    USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin');

CREATE POLICY user_permission_overrides_admin_all ON public.user_permission_overrides
    FOR ALL TO authenticated
    USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin');

-- Owner: SELECT only (read reference)
CREATE POLICY roles_owner_select ON public.roles
    FOR SELECT TO authenticated
    USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner');

CREATE POLICY role_permissions_owner_select ON public.role_permissions
    FOR SELECT TO authenticated
    USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner');

-- Employee: no access (permissions come via JWT only)

-- ============================================================
-- 5. Seed: 3 roles del sistema
-- ============================================================
INSERT INTO public.roles (id, name, description, is_system, rls_tier)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin',    'Super-administrador global — acceso total a todos los tenants', true, 'admin'),
    ('00000000-0000-0000-0000-000000000002', 'owner',    'Dueño del local — acceso completo a su tenant',                true, 'owner'),
    ('00000000-0000-0000-0000-000000000003', 'employee', 'Empleado del local — acceso limitado a POS y clientes',       true, 'employee')
ON CONFLICT (name) WHERE deleted_at IS NULL DO NOTHING;

-- ============================================================
-- 6. Seed: permisos por rol
-- ============================================================
-- Owner: todos los CRUD + reports
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM (
    SELECT id FROM public.roles WHERE name = 'owner' AND deleted_at IS NULL
) r
CROSS JOIN LATERAL (
    VALUES
        ('dashboard:read'),
        ('inventory:create'), ('inventory:read'), ('inventory:update'), ('inventory:delete'),
        ('inventory:adjust_stock'), ('inventory:import_csv'), ('inventory:manage_categories'),
        ('production:create'), ('production:read'), ('production:update'), ('production:delete'),
        ('production:produce_batch'),
        ('purchases:create'), ('purchases:read'), ('purchases:update'), ('purchases:delete'),
        ('purchases:receive_order'), ('purchases:pay_debt'),
        ('pos:create'), ('pos:read'), ('pos:update'), ('pos:delete'),
        ('pos:void_sale'), ('pos:close_box'), ('pos:open_box'), ('pos:apply_discount'),
        ('gastos:create'), ('gastos:read'), ('gastos:update'), ('gastos:delete'),
        ('customers:create'), ('customers:read'), ('customers:update'), ('customers:delete'),
        ('customers:collect_debt'),
        ('reports:read'), ('reports:export'), ('reports:view_financials')
) p(permission)
ON CONFLICT (role_id, permission) DO NOTHING;

-- Employee: solo POS y customers (lectura + creación)
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM (
    SELECT id FROM public.roles WHERE name = 'employee' AND deleted_at IS NULL
) r
CROSS JOIN LATERAL (
    VALUES
        ('pos:create'), ('pos:read'),
        ('customers:create'), ('customers:read')
) p(permission)
ON CONFLICT (role_id, permission) DO NOTHING;

-- ============================================================
-- 7. Actualizar custom_access_token_hook
-- ============================================================
-- El hook existente se extiende para inyectar permissions[] en app_metadata.
-- Admin no está en user_roles → el hook salta, el JWT conserva su metadata preexistente.
-- Owner/Employee: se inyectan permissions desde role_permissions + overrides.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_role text;
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
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(event, '{claims, app_metadata, tenant_id}', to_jsonb(v_tenant_id::text));
        END IF;

        -- Build permissions array from role_permissions table
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
