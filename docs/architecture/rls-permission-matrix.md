# Matriz Tabla → Módulo (RLS Permissions)

> **Fecha:** 2026-06-20 | **Versión:** 1.0
> **Propósito:** Mapear cada tabla pública al módulo del sistema que le corresponde, documentando políticas RLS actuales y su relación con el sistema de permisos granulares.

## Resumen

LogisCore tiene **28 tablas públicas** con **74 políticas RLS** organizadas en 3 tiers: `admin` (bypass total), `owner` (tenant completo), `employee` (tenant limitado). Este documento mapea cada tabla a su módulo de negocio y al permiso granular correspondiente.

## Helper function

```sql
-- Verifica si el JWT actual tiene un permiso específico
SELECT public.has_permission('inventory:read');

-- Admin bypass: si permissions[] es null → retorna true
-- Owner con permiso: retorna true
-- Employee sin permiso: retorna false
```

## Matriz Tabla → Módulo

### 📊 Dashboard
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| — | Sin tabla propia | — | `dashboard:read` |

### 📦 Inventory
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `products` | admin_all, owner_all, employee_select | SELECT | `inventory:read` |
| `categories` | admin_all, owner_all, employee_select | SELECT | `inventory:read` |
| `product_presentations` | admin_all, owner_all, employee_select | SELECT | `inventory:read` |
| `inventory_lots` | admin_all, owner_all, employee_select | SELECT | `inventory:read` |
| `inventory_movements` | admin_all, owner_all, employee_select, employee_insert | SELECT + INSERT | `inventory:read`, `inventory:create` |

### 🏭 Production
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `recipes` | admin_all, owner_all, employee_select | SELECT | `production:read` |
| `recipe_lines` | admin_all, owner_all, employee_select | SELECT | `production:read` |
| `production_orders` | admin_all, owner_all, employee_select | SELECT | `production:read` |

### 📋 Purchases
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `suppliers` | admin_all, owner_all, employee_select | SELECT | `purchases:read` |
| `purchase_orders` | admin_all, owner_all, employee_select | SELECT | `purchases:read` |
| `purchase_order_items` | admin_all, owner_all, employee_select | SELECT | `purchases:read` |
| `supplier_payments` | admin_all, owner_all, employee_select | SELECT | `purchases:read` |

### 🛒 POS
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `sales` | admin_all, owner_all, employee_select, employee_insert | SELECT (own) + INSERT | `pos:create`, `pos:read` |
| `sale_items` | admin_all, owner_all, employee_select, employee_insert | SELECT (own) + INSERT | `pos:create`, `pos:read` |
| `cash_registers` | admin_all, owner_all, employee_select | SELECT | `pos:read` |
| `credit_payments` | admin_all, owner_all, employee_select | SELECT | `pos:read` |

### 💰 Gastos
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `expenses` | owner_admin_insert, owner_admin_update, owner_admin_delete, tenant_select | ❌ Sin acceso employee | `gastos:read` |

### 👥 Customers
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `customers` | admin_all, owner_all, employee_select | SELECT | `customers:read` |

### 🔧 Admin / Sistema
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `tenants` | admin_all, owner_select, owner_update | ❌ Sin acceso employee | — |
| `user_roles` | admin_all, owner_select, owner_insert_employee | ❌ Solo owner puede ver/insertar | — |
| `roles` | admin_all, owner_select | ❌ Sin acceso employee | — |
| `role_permissions` | admin_all, owner_select | ❌ Sin acceso employee | — |
| `user_permission_overrides` | admin_all | ❌ Solo admin | — |
| `subscriptions` | admin_all, owner_select | SELECT (solo su tenant) | — |
| `outbox` | service roles + admin_select | ❌ Solo admin | — |
| `user_active_sessions` | users_own_session | ALL (own) | — |

### 🌐 Cross-cutting
| Tabla | Policies | Tier employee | Permiso granular |
|-------|----------|---------------|------------------|
| `exchange_rates` | admin_all, owner_all, employee_select | SELECT (tenant match) | — |
| `audit_trail` | insert, insert_authenticated, no_delete, no_update, select | INSERT + SELECT (admin/tenant) | — |

## Patrones de Políticas RLS por Tier

### Admin (bypass total)
```
USING: ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
```
3 tablas propias + todas las demás tienen policy admin_all.

### Owner (tenant completo)
```
USING: (role = 'owner' AND tenant_id = (jwt->'app_metadata'->>'tenant_id')::uuid)
```
Tiene ALL en todas las tablas de su tenant (excepto expenses que usa check explícito).

### Employee (tenant limitado)
```
USING: (role = 'employee' AND tenant_id = (...))
```
Solo SELECT en la mayoría de tablas. Excepciones:
- `sales` / `sale_items`: SELECT solo propias (`user_id = auth.uid()`)
- `inventory_movements` / `sales` / `sale_items`: INSERT permitido
- `expenses`, `tenants`, `roles`, `role_permissions`, `user_roles`: SIN acceso
- `customers`: SELECT con rol check `= ANY(ARRAY['employee','owner','admin'])`

## Notas de Arquitectura

1. **RLS por rol, no por permiso granular**: El sistema actual usa 3 tiers (admin/owner/employee via `rls_tier`). Los permisos granulares (`module:action`) se validan exclusivamente en frontend.

2. **Offline-first constraint**: El SyncEngine necesita SELECT en todas las tablas para sincronizar datos localmente. Si aplicáramos RLS granular (ej: `has_permission('inventory:read')`), un employee sin permiso de inventory no podría bajar productos → Dexie vacía → POS no funciona.

3. **¿Cuándo usar has_permission() en RLS?**: Si en el futuro se necesita restringir acceso a nivel BD (ej: employee sin `inventory:read`), habría que modificar el SyncEngine para que filtre por módulo, o aplicar policies solo en tablas no críticas para sync.

4. **Escritura ya protegida**: Las operaciones de escritura (INSERT/UPDATE/DELETE) están protegidas por `requireRole()` en Edge Functions + policies de rol. Los permisos granulares de frontend impiden que un employee vea botones de acciones que no le corresponden.
