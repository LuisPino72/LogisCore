import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ADMIN_EMAIL = 'luispinos2009@hotmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!authHeader) {
    return new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
  if (authError || !user) {
    return new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: roleData } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).single();
  if (roleData?.role !== 'admin' || user.email !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ code: 'ADMIN_ONLY' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Get all auth users
  const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) {
    return new Response(JSON.stringify({ code: 'USERS_FETCH_FAILED', message: usersError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const emailMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  for (const u of authUsers?.users ?? []) {
    emailMap.set(u.id, u.email ?? '');
    nameMap.set(u.id, (u.user_metadata as Record<string, unknown>)?.name as string ?? '');
  }

  // Get all user_roles with tenant info
  const { data: userRoles, error: rolesError } = await supabaseAdmin
    .from('user_roles')
    .select('id, user_id, role, tenant_id, created_at, tenants!inner(name, slug)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (rolesError) {
    return new Response(JSON.stringify({ code: 'ROLES_FETCH_FAILED', message: rolesError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

  return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
