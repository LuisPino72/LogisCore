-- Migration: RLS granular en INSERT/UPDATE/DELETE para tier employee
-- Fecha: 2026-06-20
-- Descripción: Agrega policies employee-tier con has_permission() en
--              todas las tablas públicas. Las policies existentes
--              (owner_all, admin_all, employee_select) no se modifican.
--
-- Nota: employee_insert policies existentes en sales/sale_items/inventory_movements
--       se reemplazan para incluir has_permission('pos:create').

-- ============================================================
-- 1. Reemplazar employee_insert policies existentes
-- ============================================================

DROP POLICY IF EXISTS sales_employee_insert ON public.sales;
CREATE POLICY sales_employee_insert ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

DROP POLICY IF EXISTS sale_items_employee_insert ON public.sale_items;
CREATE POLICY sale_items_employee_insert ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

DROP POLICY IF EXISTS inventory_movements_employee_insert ON public.inventory_movements;
CREATE POLICY inventory_movements_employee_insert ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 2. Inventory module — products, categories, presentations, lots
-- ============================================================

CREATE POLICY products_employee_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY products_employee_update ON public.products
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY products_employee_delete ON public.products
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY categories_employee_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:manage_categories')
    AND ((tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)) OR (tenant_id IS NULL))
  );

CREATE POLICY categories_employee_update ON public.categories
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:manage_categories')
    AND ((tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)) OR (tenant_id IS NULL))
  );

CREATE POLICY categories_employee_delete ON public.categories
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:manage_categories')
    AND ((tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)) OR (tenant_id IS NULL))
  );

CREATE POLICY product_presentations_employee_insert ON public.product_presentations
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY product_presentations_employee_update ON public.product_presentations
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY product_presentations_employee_delete ON public.product_presentations
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY inventory_lots_employee_insert ON public.inventory_lots
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY inventory_lots_employee_update ON public.inventory_lots
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY inventory_lots_employee_delete ON public.inventory_lots
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY inventory_movements_employee_update ON public.inventory_movements
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY inventory_movements_employee_delete ON public.inventory_movements
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('inventory:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 3. Production module — recipes, recipe_lines, production_orders
-- ============================================================

CREATE POLICY recipes_employee_insert ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY recipes_employee_update ON public.recipes
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY recipes_employee_delete ON public.recipes
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY recipe_lines_employee_insert ON public.recipe_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY recipe_lines_employee_update ON public.recipe_lines
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY recipe_lines_employee_delete ON public.recipe_lines
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY production_orders_employee_insert ON public.production_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY production_orders_employee_update ON public.production_orders
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY production_orders_employee_delete ON public.production_orders
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('production:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 4. Purchases module — suppliers, orders, items, payments
-- ============================================================

CREATE POLICY suppliers_employee_insert ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY suppliers_employee_update ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY suppliers_employee_delete ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY purchase_orders_employee_insert ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY purchase_orders_employee_update ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY purchase_orders_employee_delete ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY purchase_order_items_employee_insert ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:create')
    AND (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_items.order_id AND po.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)))
  );

CREATE POLICY purchase_order_items_employee_update ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:update')
    AND (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_items.order_id AND po.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)))
  );

CREATE POLICY purchase_order_items_employee_delete ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:delete')
    AND (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_items.order_id AND po.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)))
  );

CREATE POLICY supplier_payments_employee_insert ON public.supplier_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY supplier_payments_employee_update ON public.supplier_payments
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY supplier_payments_employee_delete ON public.supplier_payments
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('purchases:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 5. POS module — cash_registers, credit_payments
-- ============================================================

CREATE POLICY cash_registers_employee_insert ON public.cash_registers
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:open_box')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY cash_registers_employee_update ON public.cash_registers
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:close_box')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY credit_payments_employee_insert ON public.credit_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY credit_payments_employee_update ON public.credit_payments
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY credit_payments_employee_delete ON public.credit_payments
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('pos:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 6. Gastos module — expenses
-- ============================================================

CREATE POLICY expenses_employee_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('gastos:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY expenses_employee_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('gastos:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY expenses_employee_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('gastos:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 7. Customers module
-- ============================================================

CREATE POLICY customers_employee_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('customers:create')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY customers_employee_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('customers:update')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

CREATE POLICY customers_employee_delete ON public.customers
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'employee')
    AND public.has_permission('customers:delete')
    AND (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  );

-- ============================================================
-- 8. Update employee seed: inventory permissions
-- ============================================================
-- El POS necesita inventory:create para inventory_movements.
-- Se agregan permisos de lectura para que el módulo sea visible.
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM (SELECT id FROM public.roles WHERE name = 'employee' AND deleted_at IS NULL) r
CROSS JOIN LATERAL (VALUES
    ('inventory:create'),
    ('inventory:read')
) p(permission)
ON CONFLICT (role_id, permission) DO NOTHING;
