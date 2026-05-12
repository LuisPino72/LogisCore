-- ============================================================
-- Migration: Inventory Module (INV-007)
-- Adds: products, categories, inventory_movements, inventory_lots
-- ============================================================

-- 1. Helper: auto-updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION moddatetime()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_crud_categories" ON categories
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_categories_tenant_deleted ON categories(tenant_id) WHERE deleted_at IS NULL;

-- 3. products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text NOT NULL,
  price_usd numeric(19,2) NOT NULL CHECK (price_usd > 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  is_weighted boolean NOT NULL DEFAULT false,
  unit text NOT NULL CHECK (unit IN ('kg', 'gr', 'lt', 'm', 'unidad')),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_min integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_crud_products" ON products
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime();

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_tenant_sku ON products(tenant_id, sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_tenant_active ON products(tenant_id) WHERE deleted_at IS NULL;

-- 4. inventory_movements (append-only audit trail)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment')),
  quantity integer NOT NULL,
  previous_stock integer NOT NULL,
  new_stock integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_movements" ON inventory_movements
  FOR SELECT
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE POLICY "tenant_insert_movements" ON inventory_movements
  FOR INSERT
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE INDEX idx_movements_product ON inventory_movements(product_id, created_at);
CREATE INDEX idx_movements_tenant ON inventory_movements(tenant_id);

-- 5. inventory_lots (FIFO simple, sync with REMOTE_WINS)
CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_added integer NOT NULL CHECK (quantity_added > 0),
  remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0),
  source_movement_id uuid REFERENCES inventory_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_crud_lots" ON inventory_lots
  FOR ALL
  USING (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

CREATE INDEX idx_lots_product_remaining ON inventory_lots(product_id, remaining_quantity, created_at);
CREATE INDEX idx_lots_tenant ON inventory_lots(tenant_id);
