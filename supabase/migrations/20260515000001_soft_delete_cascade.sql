-- Soft Delete Cascade para tenants
-- Al marcar deleted_at en un tenant, se propaga en cascada a los registros hijos
-- SPEC-ID: ADMIN-001

CREATE OR REPLACE FUNCTION cascade_soft_delete_tenant()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.user_roles    SET deleted_at = NEW.deleted_at WHERE tenant_id = OLD.id AND deleted_at IS NULL;
  UPDATE public.subscriptions SET deleted_at = NEW.deleted_at WHERE tenant_id = OLD.id AND deleted_at IS NULL;
  UPDATE public.audit_trail   SET deleted_at = NEW.deleted_at WHERE tenant_id = OLD.id AND deleted_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_cascade_soft_delete_tenant
  AFTER UPDATE OF deleted_at ON public.tenants
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION cascade_soft_delete_tenant();
