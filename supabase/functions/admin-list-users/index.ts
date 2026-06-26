import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, verifyAdmin } from '../_shared/rbac-middleware.ts';

serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const adminCheck = await verifyAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) {
    console.error('[admin-list-users] usersError:', usersError.message);
    return new Response(JSON.stringify({ code: 'USERS_FETCH_FAILED', message: 'Error al obtener usuarios' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const emailMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  for (const u of authUsers?.users ?? []) {
    emailMap.set(u.id, u.email ?? '');
    nameMap.set(u.id, (u.user_metadata as Record<string, unknown>)?.name as string ?? '');
  }

  let query = supabaseAdmin
    .from('user_roles')
    .select('id, user_id, role, tenant_id, created_at, tenants!inner(name, slug)')
    .is('deleted_at', null);

  // Owner solo ve usuarios de su tenant
  if (adminCheck.role === 'owner' && adminCheck.tenantId) {
    query = query.eq('tenant_id', adminCheck.tenantId);
  }

  const { data: userRoles, error: rolesError } = await query.order('created_at', { ascending: false });

  if (rolesError) {
    console.error('[admin-list-users] rolesError:', rolesError.message);
    return new Response(JSON.stringify({ code: 'ROLES_FETCH_FAILED', message: 'Error al obtener roles' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const result = (userRoles ?? []).map((ur: Record<string, unknown>) => {
    const uid = ur.user_id as string;
    const tenant = ur.tenants as Record<string, unknown> | undefined;
    return {
      id: ur.id,
      userId: uid,
      email: emailMap.get(uid) ?? '',
      name: nameMap.get(uid) ?? '',
      role: ur.role,
      tenantId: ur.tenant_id,
      tenantName: tenant?.name as string ?? '',
      tenantSlug: tenant?.slug as string ?? '',
      createdAt: ur.created_at,
    };
  });

  return new Response(JSON.stringify(result), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
});
