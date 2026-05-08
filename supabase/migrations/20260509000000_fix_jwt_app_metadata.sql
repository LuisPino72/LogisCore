-- Fix: JWT hook ahora inyecta claims en app_metadata
-- para que sean accesibles via session.user.app_metadata

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
        -- app_metadata (para session.user.app_metadata)
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_role));
        -- top-level (para decode directo del JWT)
        event := jsonb_set(event, '{claims, role}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(
                event,
                '{claims, app_metadata, tenant_id}',
                to_jsonb(v_tenant_id::text)
            );
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
