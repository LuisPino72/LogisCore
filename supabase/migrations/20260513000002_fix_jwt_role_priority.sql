-- Migration: 20260513000002_fix_jwt_role_priority.sql
-- Desc: Fix JWT role priority to ensure Admin is the highest authority (Admin > Owner > Employee)

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
    ORDER BY (CASE WHEN ur.role = 'admin' THEN 1 WHEN ur.role = 'owner' THEN 2 ELSE 3 END) ASC
    LIMIT 1;

    IF FOUND THEN
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(event, '{claims, app_metadata, tenant_id}', to_jsonb(v_tenant_id::text));
        END IF;
    END IF;

    RETURN event;
END;
$$;
