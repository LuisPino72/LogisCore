# LOGIN-001-02 — Dashboard Config TODO

**Issue:** #4 — `auth.audit_log_entries` está vacía
**Fix:** Habilitar Postgres-level audit en Supabase dashboard

---

## Cambio requerido en Supabase Dashboard

Ir a **Project Settings → Database → Audit Log** en el proyecto `pvnslzavkhqkvbzhdgzp`:

- `audit_log_disable_postgres`: **false** (habilita escritura automática de Supabase en `auth.audit_log_entries`)

Alternativamente, vía Management API:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/pvnslzavkhqkvbzhdgzp/config/database" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"audit_log_disable_postgres": false}'
```

---

## Verificación post-cambio

Tras aplicar el cambio, hacer un login de prueba y verificar:

```sql
SELECT created_at, payload->>'action' AS action, ip_address
FROM auth.audit_log_entries
ORDER BY created_at DESC
LIMIT 5;
```

Debe retornar ≥1 fila con `action` ∈ {`'login'`, `'token_refreshed'`, `'logout'`}.

---

## Estado

- [ ] Cambio aplicado en dashboard
- [ ] Verificado con query SQL que `auth.audit_log_entries` se popula
- [ ] Si Supabase no escribe automáticamente, abrir ticket a soporte (workaround: trigger custom)

**Responsable:** Sasa (requiere acceso a Supabase dashboard)

**Nota:** Este cambio NO requiere código cliente. Se commitea este TODO para que quede
trazabilidad del cambio requerido.
