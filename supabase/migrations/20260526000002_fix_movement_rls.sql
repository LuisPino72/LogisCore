-- Fix RLS for inventory_movements: allow UPDATE for sync upsert
DROP POLICY IF EXISTS tenant_insert_movements ON inventory_movements;
CREATE POLICY tenant_insert_movements ON inventory_movements
  FOR INSERT
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE POLICY tenant_update_movements ON inventory_movements
  FOR UPDATE
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
