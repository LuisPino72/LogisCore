-- Fix: todas las RLS policies que usan auth.jwt() ->> 'role' deben leer desde app_metadata
-- El top-level claim 'role' ya no existe en el JWT (fue eliminado por conflicto con PostgREST)

-- TENANTS
DROP POLICY IF EXISTS "tenants_admin_all" ON public.tenants;
CREATE POLICY "tenants_admin_all" ON public.tenants
    FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- USER_ROLES
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles
    FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "subscriptions_admin_all" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_all" ON public.subscriptions
    FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
