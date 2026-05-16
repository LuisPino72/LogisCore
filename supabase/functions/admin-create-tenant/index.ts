// Edge Function: admin-create-tenant (SPEC-ID: ADMIN-001)
// Crea tenant + owner + empleados en una llamada atomica con service_role.
// Verifica doblemente que el JWT pertenece al admin (role=admin + email hardcodeado).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

const ADMIN_EMAIL = 'luispinos2009@hotmail.com';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ code: 'CONFIG_ERROR', message: 'Server misconfiguration' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Client with service_role for admin operations
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // 1. Validate admin JWT
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token requerido' }),
      { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token inválido o expirado' }),
      { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 2. Double verification: role=admin + email hardcodeado
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin' || user.email !== ADMIN_EMAIL) {
    return new Response(
      JSON.stringify({ code: 'ADMIN_ONLY', message: 'Solo el administrador puede ejecutar esta operación' }),
      { status: 403, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 3. Parse and validate request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'JSON inválido' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 4. Determine mode: create tenant + users, or just add users to existing tenant
  if (body.tenant && body.owner) {
    // MODE 1: Create full tenant with owner + employees
    return await createFullTenant(supabaseAdmin, body);
  } else if (body.existingTenantId && body.employees?.length) {
    // MODE 2: Add employees to existing tenant
    return await addUsersToTenant(supabaseAdmin, body.existingTenantId, body.employees);
  } else {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'Payload inválido: debe incluir tenant+owner o existingTenantId+employees' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }
});

async function createFullTenant(supabaseAdmin: ReturnType<typeof createClient>, body: RequestBody): Promise<Response> {
  const { tenant: tenantInput, owner: ownerInput, employees = [] } = body;
  if (!tenantInput || !ownerInput) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'tenant y owner son requeridos' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Validate RIF format (V/J/E/G/P + 9 digits)
  if (!/^[VJEGP]\d{9}$/.test(tenantInput.rif)) {
    return new Response(
      JSON.stringify({ code: 'INVALID_RIF', message: 'Formato RIF inválido. Debe ser letra (V,J,E,G,P) + 9 dígitos (ej: J-123456789)' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Validate owner email
  if (!ownerInput.email || !ownerInput.email.includes('@')) {
    return new Response(
      JSON.stringify({ code: 'INVALID_EMAIL', message: 'Email del owner inválido' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  if (!ownerInput.password || ownerInput.password.length < 6) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PASSWORD', message: 'La contraseña debe tener al menos 6 caracteres' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Generate slug from name
  const slug = tenantInput.name
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');

  if (!slug) {
    return new Response(
      JSON.stringify({ code: 'INVALID_SLUG', message: 'No se pudo generar un slug del nombre' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Check slug uniqueness
  const { data: existing } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ code: 'TENANT_SLUG_DUPLICATE', message: `El slug "${slug}" ya existe` }),
      { status: 409, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Create tenant
  const { data: tenantRaw, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenantInput.name,
      rif: tenantInput.rif,
      slug,
      direccion: tenantInput.direccion ?? null,
      telefono: tenantInput.telefono ?? null,
    })
    .select('id, name, slug, rif, direccion, telefono, created_at')
    .single();

  if (tenantError) {
    return new Response(
      JSON.stringify({ code: 'TENANT_CREATE_FAILED', message: `Error al crear tenant: ${tenantError.message}` }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  const tenant = { ...tenantRaw, plan: 'basic' };

  // Create owner auth user
  const { data: ownerAuth, error: ownerError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerInput.email,
    password: ownerInput.password,
    user_metadata: { name: ownerInput.name },
    email_confirm: true,
  });

  if (ownerError) {
    // Rollback: soft delete the tenant
    await supabaseAdmin.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
    return new Response(
      JSON.stringify({ code: 'AUTH_EMAIL_EXISTS', message: `Error al crear owner: ${ownerError.message}` }),
      { status: 409, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Create owner role
  const { error: ownerRoleError } = await supabaseAdmin
    .from('user_roles')
    .insert({ user_id: ownerAuth.user.id, tenant_id: tenant.id, role: 'owner' });

  if (ownerRoleError) {
    await supabaseAdmin.auth.admin.deleteUser(ownerAuth.user.id);
    await supabaseAdmin.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
    return new Response(
      JSON.stringify({ code: 'ROLE_CREATE_FAILED', message: `Error al asignar rol: ${ownerRoleError.message}` }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Create employees
  const createdEmployees: Array<{ id: string; email: string; name: string }> = [];
  for (const emp of employees) {
    const { data: empAuth, error: empError } = await supabaseAdmin.auth.admin.createUser({
      email: emp.email,
      password: emp.password,
      user_metadata: { name: emp.name },
      email_confirm: true,
    });

    if (empError) {
      continue; // Skip failed employee, continue with others
    }

    const { error: empRoleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: empAuth.user.id, tenant_id: tenant.id, role: 'employee' });

    if (empRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(empAuth.user.id);
      continue;
    }

    createdEmployees.push({ id: empAuth.user.id, email: emp.email, name: emp.name });
  }

  // Enqueue outbox event
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
    }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
  );
}

async function addUsersToTenant(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: string,
  users: UserInput[],
): Promise<Response> {
  // Verify tenant exists
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .single();

  if (!tenant) {
    return new Response(
      JSON.stringify({ code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' }),
      { status: 404, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // Check employee count limit (max 3 per tenant)
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
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  const createdUsers: Array<{ id: string; email: string; name: string }> = [];
  for (const user of users) {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      user_metadata: { name: user.name },
      email_confirm: true,
    });

    if (authError) {
      continue;
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: authUser.user.id, tenant_id: tenantId, role: 'employee' });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      continue;
    }

    createdUsers.push({ id: authUser.user.id, email: user.email, name: user.name });
  }

  return new Response(
    JSON.stringify({ employees: createdUsers }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
  );
}
