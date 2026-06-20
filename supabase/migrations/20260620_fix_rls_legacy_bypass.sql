-- Migration: Fix RLS legacy bypass + admin_all policies + has_permission() fix
-- Fecha: 2026-06-20
-- Descripción:
--   Part A: Reemplazar legacy tenant_crud_* policies (solo tenant_id, sin role check)
--           por owner_all + admin_all + employee_select en inventory tables.
--   Part B: Fix has_permission() para admin con array vacío [].
--
-- Bugs corregidos:
--   BUG #1 (CRÍTICO): Legacy tenant_crud_* policies bypassan permisos granulares.
--     PostgreSQL combina policies con OR; la legacy solo checkea tenant_id,
--     permitiendo a employee hacer CRUD completo sin has_permission().
--   BUG #2 (ALTO): Inventory tables sin admin_all policies.
--     Admin tiene tenant_id=NULL, NULL=NULL es NULL (no TRUE), no podía leer.
--   BUG #3 (MEDIO): has_permission() retorna false para admin.
--     Admin tiene permissions=[] (no null), []::jsonb IS NULL es false.

-- ============================================================
-- PART A — Reemplazar legacy tenant_crud_* policies en inventory
-- ============================================================

-- DROP legacy policies (sin role check, solo tenant_id)
DROP POLICY IF EXISTS "tenant_crud_products" ON products;
DROP POLICY IF EXISTS "tenant_crud_categories" ON categories;
DROP POLICY IF EXISTS "tenant_crud_lots" ON inventory_lots;

-- ============================================================
-- owner_all policies (role = 'owner' + tenant_id match)
-- ============================================================

DROP POLICY IF EXISTS "products_owner_all" ON products;
CREATE POLICY "products_owner_all" ON products
    FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

DROP POLICY IF EXISTS "categories_owner_all" ON categories;
CREATE POLICY "categories_owner_all" ON categories
    FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

DROP POLICY IF EXISTS "inventory_lots_owner_all" ON inventory_lots;
CREATE POLICY "inventory_lots_owner_all" ON inventory_lots
    FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'owner'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

-- ============================================================
-- admin_all policies (role = 'admin' sin tenant_id check)
-- ============================================================

DROP POLICY IF EXISTS "products_admin_all" ON products;
CREATE POLICY "products_admin_all" ON products
    FOR ALL TO authenticated
    USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'))
    WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'));

DROP POLICY IF EXISTS "categories_admin_all" ON categories;
CREATE POLICY "categories_admin_all" ON categories
    FOR ALL TO authenticated
    USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'))
    WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'));

DROP POLICY IF EXISTS "inventory_lots_admin_all" ON inventory_lots;
CREATE POLICY "inventory_lots_admin_all" ON inventory_lots
    FOR ALL TO authenticated
    USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'))
    WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'));

DROP POLICY IF EXISTS "product_presentations_admin_all" ON product_presentations;
CREATE POLICY "product_presentations_admin_all" ON product_presentations
    FOR ALL TO authenticated
    USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'))
    WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'));

DROP POLICY IF EXISTS "inventory_movements_admin_all" ON inventory_movements;
CREATE POLICY "inventory_movements_admin_all" ON inventory_movements
    FOR ALL TO authenticated
    USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'))
    WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'));

-- ============================================================
-- employee_select policies (role = 'employee' + tenant_id)
-- Se combinan vía OR con las granulares existentes (I/U/D).
-- Employee puede SELECT siempre, pero I/U/D requiere permiso.
-- ============================================================

DROP POLICY IF EXISTS "products_employee_select" ON products;
CREATE POLICY "products_employee_select" ON products
    FOR SELECT TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'employee'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

DROP POLICY IF EXISTS "categories_employee_select" ON categories;
CREATE POLICY "categories_employee_select" ON categories
    FOR SELECT TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'employee'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

DROP POLICY IF EXISTS "inventory_lots_employee_select" ON inventory_lots;
CREATE POLICY "inventory_lots_employee_select" ON inventory_lots
    FOR SELECT TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'employee'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    );

-- ============================================================
-- PART B — Fix has_permission() para admin con array vacío
-- ============================================================
-- Admin tiene permissions = [] (array vacío por COALESCE en hook).
-- []::jsonb IS NULL es false, por lo que el bypass fallaba.
-- Se agrega OR v_permissions = '[]'::jsonb.

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

    -- Admin bypass: si permissions es null O array vacío → todo permitido
    IF v_permissions IS NULL OR v_permissions = '[]'::jsonb THEN
        RETURN true;
    END IF;

    -- JSON containment operator: verifica que el permiso esté en el array
    RETURN v_permissions @> to_jsonb(ARRAY[required_permission]);
END;
$$;
