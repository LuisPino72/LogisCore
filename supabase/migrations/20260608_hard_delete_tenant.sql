-- =============================================================================
-- hard_delete_tenant: Elimina un tenant y TODOS sus datos dependientes
-- =============================================================================
-- ORDEN CRÍTICO: respetar FK dependencies (child → parent)
-- SECURITY DEFINER: ejecuta con permisos de owner (bypass RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hard_delete_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- =========================================================================
  -- 1. Tablas nietas (dependen de otras tablas hijas)
  -- =========================================================================
  DELETE FROM recipe_lines        WHERE tenant_id = p_tenant_id;
  DELETE FROM production_orders   WHERE tenant_id = p_tenant_id;
  DELETE FROM purchase_order_items WHERE tenant_id = p_tenant_id;
  DELETE FROM sale_items          WHERE tenant_id = p_tenant_id;

  -- =========================================================================
  -- 2. Tablas hijas intermedias
  -- =========================================================================
  DELETE FROM recipes             WHERE tenant_id = p_tenant_id;
  DELETE FROM purchase_orders     WHERE tenant_id = p_tenant_id;
  DELETE FROM sales               WHERE tenant_id = p_tenant_id;
  DELETE FROM cash_registers      WHERE tenant_id = p_tenant_id;

  -- =========================================================================
  -- 3. Tablas hoja (sin dependencias otras hijas)
  -- =========================================================================
  DELETE FROM product_presentations WHERE tenant_id = p_tenant_id;
  DELETE FROM products              WHERE tenant_id = p_tenant_id;
  DELETE FROM categories            WHERE tenant_id = p_tenant_id;
  DELETE FROM suppliers             WHERE tenant_id = p_tenant_id;
  DELETE FROM customers             WHERE tenant_id = p_tenant_id;
  DELETE FROM inventory_movements   WHERE tenant_id = p_tenant_id;
  DELETE FROM inventory_lots        WHERE tenant_id = p_tenant_id;
  DELETE FROM exchange_rates        WHERE tenant_id = p_tenant_id;
  DELETE FROM expenses              WHERE tenant_id = p_tenant_id;
  DELETE FROM audit_trail           WHERE tenant_id = p_tenant_id;
  DELETE FROM subscriptions         WHERE tenant_id = p_tenant_id;
  DELETE FROM user_active_sessions  WHERE tenant_id = p_tenant_id;
  DELETE FROM user_roles            WHERE tenant_id = p_tenant_id;

  -- =========================================================================
  -- 4. Eliminar el tenant
  -- =========================================================================
  DELETE FROM tenants WHERE id = p_tenant_id;

END;
$$;
