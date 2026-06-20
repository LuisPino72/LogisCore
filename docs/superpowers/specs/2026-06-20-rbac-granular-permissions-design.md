# RBAC Granular - Diseño de Permisos Configurables

> **Fecha:** 2026-06-20 | **Estado:** Aprobado | **Versión:** 1.0
> **Contexto:** Reemplazar sistema de 3 roles hardcodeados por RBAC granular configurable desde Admin Panel.

## Resumen

Sistema de Roles y Permisos granulares con formato `module:action`. Permite crear tipos de usuario custom desde el Admin Panel, asignar permisos CRUD + acciones especiales por módulo, y excepciones por usuario (allow/deny overrides).

## Arquitectura

### Flujo de datos

```
Admin Panel → CRUD roles         → Supabase (roles + role_permissions)
Admin Panel → Overrides por user  → Supabase (user_permission_overrides)
                                       ↓
                         custom_access_token_hook (plpgsql)
                           → inyecta permissions[] en JWT app_metadata
                                       ↓
                         Frontend: UserSession.permissions desde JWT
                         RLS (futuro): auth.jwt() -> 'app_metadata' ->> 'permissions'
```

### Estrategia de riesgo cero — rollout en fases

| Fase | Cambio | Riesgo |
|------|--------|--------|
| 0 | Tablas Supabase + Seed + Hook | 🟢 Cero (datos nuevos, hook extendido) |
| 1 | Frontend: hasPermission() desde JWT | 🟡 Medio (datos seed = exactamente los permisos actuales) |
| 2 | Admin Panel UI | 🟢 Cero (solo UI nueva) |
| 3 | RLS granular | 🟡 Postergable |

**Admin siempre bypass**: Luis (admin) no está en `user_roles` → el hook nunca le inyecta permissions → `hasPermission` retorna true para todo.

### Modelo de datos (Supabase)

```sql
-- Roles: define los tipos de usuario
roles (id, name, description, is_system, rls_tier, created_at, deleted_at)

-- Permisos por rol: module:action
role_permissions (id, role_id FK, permission, created_at)
  UNIQUE (role_id, permission)

-- Excepciones por usuario (allow/deny)
user_permission_overrides (id, user_id FK, tenant_id FK, permission, effect, created_at)
  UNIQUE (user_id, tenant_id, permission)
```

### Formato de permisos: `module:action`

| Módulo | Acciones CRUD | Acciones especiales |
|--------|--------------|---------------------|
| dashboard | read | — |
| inventory | create, read, update, delete | adjust_stock, import_csv, manage_categories |
| production | create, read, update, delete | produce_batch |
| purchases | create, read, update, delete | receive_order, pay_debt |
| pos | create, read, update, delete | void_sale, close_box, open_box, apply_discount |
| gastos | create, read, update, delete | — |
| customers | create, read, update, delete | collect_debt |
| reports | read, export | view_financials |
| admin | — | manage_tenants, manage_roles, manage_users, manage_subscriptions |

### Seed (3 roles del sistema)

| Rol | rls_tier | Permisos seed |
|-----|----------|---------------|
| admin | admin | Sin permisos (bypass total) |
| owner | owner | Todos los CRUD + reports:export |
| employee | employee | pos:create, pos:read, customers:create, customers:read |

### custom_access_token_hook (extendido)

El hook existente se actualiza para inyectar `permissions[]` en `app_metadata`:
1. Busca `user_roles` (igual que hoy)
2. Si encuentra: inyecta role + tenant_id (como hoy) + permissions desde `role_permissions`
3. Aplica overrides: allow añade permisos, deny los remueve
4. Si no encuentra (admin): no modifica nada (admin mantiene metadata preexistente)

### Frontend (Fase 1)

- `hasPermission(session, module)` → busca si existe algún `module:*` en `session.permissions`
- `hasPermission(session, module, action)` → busca `module:action` exacto
- Se elimina `rolePermissions.ts` como fuente de verdad
- `UserSession.permissions` se puebla directamente desde JWT
- Sidebar filter usa el nuevo `hasPermission`

### Admin Panel UI (Fase 2)

- Nueva tab "Roles" en AdminPanelPage
- Lista de roles con indicador system vs custom
- Modal de creación/edición con matrix de permisos (checkboxes por módulo+acción)
- Vista de overrides por usuario en UserSection

### Archivos afectados

| Archivo | Fase | Cambio |
|---------|------|--------|
| `supabase/migrations/20260620_role_permissions.sql` | 0 | Nuevo: tablas + seed + hook |
| `packages/core/src/types.ts` | 1 | Actualizar Permission |
| `apps/web/src/features/auth/permissions/rolePermissions.ts` | 1 | Reemplazar por nuevo sistema |
| `apps/web/src/features/auth/services/authService.ts` | 1 | Leer permissions del JWT |
| `apps/web/src/lib/jwt.ts` | 1 | extractPermissions() |
| `apps/web/src/specs/roles/index.ts` | 0b | Nuevo: Zod schemas |
| `apps/web/src/specs/roles/errors.ts` | 0b | Nuevo: error codes |
| `apps/web/src/features/admin/components/AdminPanelPage.tsx` | 2 | Nueva tab Roles |
| `apps/web/src/features/admin/components/RoleSection.tsx` | 2 | Nuevo |
| `apps/web/src/features/admin/components/RoleFormModal.tsx` | 2 | Nuevo |
| `apps/web/src/features/admin/services/adminService.ts` | 2 | CRUD roles |

### Plan de contingencia

Si Fase 1 rompe algo: revertir `hasPermission()` a la implementación anterior es un cambio de 2 líneas. No hay migración de datos destructiva.
