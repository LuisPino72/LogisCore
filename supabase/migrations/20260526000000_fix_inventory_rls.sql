-- Fix RLS policies: tenant_id is in auth.jwt()->'app_metadata', not top-level
DROP POLICY IF EXISTS tenant_crud_categories ON categories;
CREATE POLICY tenant_crud_categories ON categories
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

DROP POLICY IF EXISTS tenant_crud_products ON products;
CREATE POLICY tenant_crud_products ON products
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

DROP POLICY IF EXISTS tenant_select_movements ON inventory_movements;
CREATE POLICY tenant_select_movements ON inventory_movements
  FOR SELECT
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

DROP POLICY IF EXISTS tenant_insert_movements ON inventory_movements;
CREATE POLICY tenant_insert_movements ON inventory_movements
  FOR INSERT
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

DROP POLICY IF EXISTS tenant_crud_lots ON inventory_lots;
CREATE POLICY tenant_crud_lots ON inventory_lots
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
