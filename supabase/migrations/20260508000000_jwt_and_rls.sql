-- Migration: 20260508000000_jwt_and_rls.sql
-- JWT Custom Claims Hook + RLS Hardening + Performance Indexes + Trigger Fix

-- 1. Permitir admin sin tenant_id
ALTER TABLE user_roles ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. JWT Custom Access Token Hook
-- Inyecta role y tenant_id en los JWT claims desde user_roles
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_tenant_id uuid;
BEGIN
    SELECT ur.role, ur.tenant_id INTO v_role, v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = (event->>'user_id')::uuid
      AND ur.deleted_at IS NULL
    LIMIT 1;

    IF FOUND THEN
        event := jsonb_set(event, '{claims, role}', to_jsonb(v_role));
        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(
                event,
                '{claims, tenant_id}',
                to_jsonb(v_tenant_id::text)
            );
        END IF;
    END IF;

    RETURN event;
END;
$$;

-- 3. Fix handle_new_tenant: auto-crear subscription al crear tenant
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.subscriptions (tenant_id, plan, status, started_at, expires_at)
    VALUES (NEW.id, NEW.plan, 'active', now(), now() + interval '30 days');
    RETURN NEW;
END;
$$;

-- 4. Eliminar policies legacy (iniciales)
DROP POLICY IF EXISTS "Tenants: View own" ON tenants;
DROP POLICY IF EXISTS "UserRoles: View own" ON user_roles;
DROP POLICY IF EXISTS "Subscriptions: View own" ON subscriptions;

-- 5. RLS — TENANTS
CREATE POLICY "tenants_admin_all" ON tenants
    FOR ALL
    USING ((auth.jwt() ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "tenants_owner_select" ON tenants
    FOR SELECT
    USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "tenants_owner_update" ON tenants
    FOR UPDATE
    USING (id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- 6. RLS — USER_ROLES
CREATE POLICY "user_roles_admin_all" ON user_roles
    FOR ALL
    USING ((auth.jwt() ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "user_roles_owner_select" ON user_roles
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "user_roles_owner_insert_employee" ON user_roles
    FOR INSERT
    WITH CHECK (
        (auth.jwt() ->> 'role') = 'owner'
        AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND role = 'employee'
    );

-- 7. RLS — SUBSCRIPTIONS
CREATE POLICY "subscriptions_admin_all" ON subscriptions
    FOR ALL
    USING ((auth.jwt() ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "subscriptions_owner_select" ON subscriptions
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id ON user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
