-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLAS CORE
-- Tenants: Entidades propietarias del sistema
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    rif TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'basic',
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- User Roles: Asignación de roles por tenant
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'employee')),
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(user_id, tenant_id)
);

-- Subscriptions: Estado de suscripción del tenant
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'basic',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SEGURIDAD (RLS)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas para tenants: Solo admins globales o dueños pueden ver sus datos
-- NOTA: La política real dependerá del JWT claim 'tenant_id'
CREATE POLICY "Tenants: View own" ON tenants
    FOR SELECT
    USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "UserRoles: View own" ON user_roles
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "Subscriptions: View own" ON subscriptions
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- 4. TRIGGERS DE AUTOMATIZACIÓN
-- Trigger para crear automáticamente el rol 'owner' al crear un tenant (simulado)
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
    -- Lógica para vincular al creador como owner
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_tenant_created
    AFTER INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant();
