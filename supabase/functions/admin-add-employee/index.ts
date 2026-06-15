import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, verifyAdmin, validatePassword } from '../_shared/rbac-middleware.ts';

interface UserInput {
  email: string;
  password: string;
  name: string;
}

interface RequestBody {
  tenantId: string;
  employees: UserInput[];
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ code: 'CONFIG_ERROR', message: 'Server misconfiguration' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const adminCheck = await verifyAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'JSON inválido' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  if (!body.tenantId || !body.employees?.length) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'tenantId y employees son requeridos' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  return await addUsersToTenant(supabaseAdmin, body.tenantId, body.employees, origin);
});

async function addUsersToTenant(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: string,
  users: UserInput[],
  origin: string,
): Promise<Response> {
  const headers = corsHeaders(origin);

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .single();

  if (!tenant) {
    return new Response(
      JSON.stringify({ code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' }),
      { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'employee')
    .is('deleted_at', null);

  const currentEmployees = count ?? 0;
  if (currentEmployees + users.length > 3) {
    return new Response(
      JSON.stringify({ code: 'ADMIN_PLAN_USER_LIMIT_EXCEEDED', message: `Límite de 3 empleados alcanzado (actual: ${currentEmployees})` }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const createdUsers: Array<{ id: string; email: string; name: string }> = [];
  const failedUsers: Array<{ email: string; reason: string }> = [];
  for (const user of users) {
    const passwordError = validatePassword(user.password);
    if (passwordError) {
      failedUsers.push({ email: user.email, reason: 'password_invalid' });
      continue;
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      user_metadata: { name: user.name },
      email_confirm: true,
    });

    if (authError) {
      failedUsers.push({ email: user.email, reason: 'auth_error' });
      continue;
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: authUser.user.id, tenant_id: tenantId, role: 'employee' });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      failedUsers.push({ email: user.email, reason: 'role_error' });
      continue;
    }

    createdUsers.push({ id: authUser.user.id, email: user.email, name: user.name });
  }

  return new Response(
    JSON.stringify({ employees: createdUsers, failedEmployees: failedUsers.length > 0 ? failedUsers : undefined }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  );
}
