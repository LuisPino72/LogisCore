import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, verifyAdmin, validatePassword } from '../_shared/rbac-middleware.ts';

interface UserInput {
  email: string;
  password: string;
  name: string;
}

interface RequestBody {
  tenant?: { name: string; rif: string; direccion?: string; telefono?: string } | null;
  owner?: UserInput | null;
  employees?: UserInput[];
  existingTenantId?: string;
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

  if (body.tenant && body.owner) {
    return await createFullTenant(supabaseAdmin, body, origin);
  } else if (body.existingTenantId && body.employees?.length) {
    return await addUsersToTenant(supabaseAdmin, body.existingTenantId, body.employees, origin);
  } else {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'Payload inválido: debe incluir tenant+owner o existingTenantId+employees' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});

async function createFullTenant(supabaseAdmin: ReturnType<typeof createClient>, body: RequestBody, origin: string): Promise<Response> {
  const { tenant: tenantInput, owner: ownerInput, employees = [] } = body;
  const headers = corsHeaders(origin);

  if (!tenantInput || !ownerInput) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'tenant y owner son requeridos' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const rif = tenantInput.rif.replace(/-/g, '');
  if (!/^[VJEGP]\d{9}$/.test(rif)) {
    return new Response(
      JSON.stringify({ code: 'INVALID_RIF', message: 'Formato RIF inválido. Debe ser letra (V,J,E,G,P) + 9 dígitos (ej: J-123456789)' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  if (!ownerInput.email || !ownerInput.email.includes('@')) {
    return new Response(
      JSON.stringify({ code: 'INVALID_EMAIL', message: 'Email del owner inválido' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const passwordError = validatePassword(ownerInput.password);
  if (passwordError) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PASSWORD', message: passwordError }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const slug = tenantInput.name
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');

  if (!slug) {
    return new Response(
      JSON.stringify({ code: 'INVALID_SLUG', message: 'No se pudo generar un slug del nombre' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ code: 'TENANT_SLUG_DUPLICATE', message: `El slug "${slug}" ya existe` }),
      { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { data: tenantRaw, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenantInput.name,
      rif,
      slug,
      direccion: tenantInput.direccion ?? null,
      telefono: tenantInput.telefono ?? null,
    })
    .select('id, name, slug, rif, direccion, telefono, created_at')
    .single();

  if (tenantError) {
    console.error('[admin-create-tenant] tenantError:', tenantError.message);
    return new Response(
      JSON.stringify({ code: 'TENANT_CREATE_FAILED', message: 'Error al crear el tenant' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const tenant = { ...tenantRaw, plan: 'basic' };

  const { data: ownerAuth, error: ownerError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerInput.email,
    password: ownerInput.password,
    user_metadata: { name: ownerInput.name },
    email_confirm: true,
  });

  if (ownerError) {
    await supabaseAdmin.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
    console.error('[admin-create-tenant] ownerError:', ownerError.message);
    return new Response(
      JSON.stringify({ code: 'AUTH_EMAIL_EXISTS', message: 'Error al crear el owner: email ya registrado o inválido' }),
      { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { error: ownerRoleError } = await supabaseAdmin
    .from('user_roles')
    .insert({ user_id: ownerAuth.user.id, tenant_id: tenant.id, role: 'owner' });

  if (ownerRoleError) {
    await supabaseAdmin.auth.admin.deleteUser(ownerAuth.user.id);
    await supabaseAdmin.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
    console.error('[admin-create-tenant] ownerRoleError:', ownerRoleError.message);
    return new Response(
      JSON.stringify({ code: 'ROLE_CREATE_FAILED', message: 'Error al asignar rol al owner' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const createdEmployees: Array<{ id: string; email: string; name: string }> = [];
  const failedEmployees: Array<{ email: string; reason: string }> = [];
  for (const emp of employees) {
    const empPasswordError = validatePassword(emp.password);
    if (empPasswordError) {
      failedEmployees.push({ email: emp.email, reason: 'password_invalid' });
      continue;
    }

    const { data: empAuth, error: empError } = await supabaseAdmin.auth.admin.createUser({
      email: emp.email,
      password: emp.password,
      user_metadata: { name: emp.name },
      email_confirm: true,
    });

    if (empError) {
      failedEmployees.push({ email: emp.email, reason: 'auth_error' });
      continue;
    }

    const { error: empRoleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: empAuth.user.id, tenant_id: tenant.id, role: 'employee' });

    if (empRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(empAuth.user.id);
      failedEmployees.push({ email: emp.email, reason: 'role_error' });
      continue;
    }

    createdEmployees.push({ id: empAuth.user.id, email: emp.email, name: emp.name });
  }

  await supabaseAdmin.from('outbox').insert({
    event: 'ADMIN.TENANT.CREATE',
    module: 'ADMIN',
    payload: { tenantId: tenant.id, slug: tenant.slug, ownerEmail: ownerInput.email, employeeCount: createdEmployees.length },
  });

  return new Response(
    JSON.stringify({
      tenant,
      owner: { id: ownerAuth.user.id, email: ownerInput.email, name: ownerInput.name },
      employees: createdEmployees,
      failedEmployees: failedEmployees.length > 0 ? failedEmployees : undefined,
    }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  );
}

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
    const empPasswordError = validatePassword(user.password);
    if (empPasswordError) {
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
