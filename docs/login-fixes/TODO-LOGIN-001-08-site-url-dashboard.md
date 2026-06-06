# TODO: site_url config change (Supabase dashboard)

**Issue:** #13 (site_url = http://127.0.0.1:3000 apunta a dev en prod)
**Origen:** PLAN-LOGIN-FIX-001, Sprint 2, commit LOGIN-001-08
**Estado:** PENDIENTE — requiere acceso a Supabase dashboard

## Acción requerida (Luis)

1. Ir a Supabase Dashboard → proyecto `pvnslzavkhqkvbzhdgzp`
2. Auth → URL Configuration
3. Cambiar `Site URL` de `http://127.0.0.1:3000` al dominio de producción real (ej: `https://app.logiscore.com` o el dominio que Luis decida)
4. Añadir el dominio a `Additional Redirect URLs` si se quiere permitir redirects (ej: Vercel preview URLs: `https://*-logiscore.vercel.app`)
5. Guardar cambios

## Validación post-cambio

- Disparar un email de confirmación o reset password
- Verificar que el link en el email apunta al dominio de producción (NO `127.0.0.1:3000`)
- Verificar que el link funciona (abre la app en el dominio correcto)

## Por qué este cambio

- Los emails de confirmación/reset/password_changed se generan con `{{ .ConfirmationURL }}` apuntando a `site_url`
- Si un user está en un entorno distinto (Vercel preview, otro puerto), los links rompen
- En producción, `site_url` debe ser el dominio público real
