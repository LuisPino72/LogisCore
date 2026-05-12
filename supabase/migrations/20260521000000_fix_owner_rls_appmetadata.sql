-- Fix: todas las políticas RLS de owner/employee que usan tenant_id
-- deben leer desde app_metadata, igual que se hizo con role en 20260519000000.
-- El claim tenant_id está en app_metadata, no en el top-level del JWT.

-- TENANTS
DROP POLICY IF EXISTS "tenants_owner_select" ON public.tenants;
CREATE POLICY "tenants_owner_select" ON public.tenants
    FOR SELECT
    USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "tenants_owner_update" ON public.tenants;
CREATE POLICY "tenants_owner_update" ON public.tenants
    FOR UPDATE
    USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- USER_ROLES
DROP POLICY IF EXISTS "user_roles_owner_select" ON public.user_roles;
CREATE POLICY "user_roles_owner_select" ON public.user_roles
    FOR SELECT
    USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "user_roles_owner_insert_employee" ON public.user_roles;
CREATE POLICY "user_roles_owner_insert_employee" ON public.user_roles
    FOR INSERT
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
        AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
        AND role = 'employee'
    );

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "subscriptions_owner_select" ON public.subscriptions;
CREATE POLICY "subscriptions_owner_select" ON public.subscriptions
    FOR SELECT
    USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
