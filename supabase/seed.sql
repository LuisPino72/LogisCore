-- Seed: Datos iniciales de LogisCore ERP

-- Insertar admin (luispinos2009@hotmail.com) en user_roles
-- Si el usuario no existe en auth.users, no inserta nada (no es error)
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT id, NULL, 'admin'
FROM auth.users
WHERE email = 'luispinos2009@hotmail.com'
ON CONFLICT (user_id, tenant_id) DO NOTHING;
