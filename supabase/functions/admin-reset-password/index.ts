import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, verifyAdmin, validatePassword } from '../_shared/rbac-middleware.ts';

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

  let body: { userId: string; newPassword: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'JSON inválido' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const passwordError = validatePassword(body.newPassword);
  if (!body.userId || passwordError) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PASSWORD', message: passwordError ?? 'userId requerido' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { data: targetRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', body.userId)
    .single();

  if (!targetRole) {
    return new Response(
      JSON.stringify({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' }),
      { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  if (targetRole.role === 'admin') {
    return new Response(
      JSON.stringify({ code: 'RESET_PASS_FORBIDDEN', message: 'No puedes resetear la contraseña de otro administrador' }),
      { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    body.userId,
    { password: body.newPassword },
  );

  if (updateError) {
    console.error('[admin-reset-password] updateError:', updateError.message);
    return new Response(
      JSON.stringify({ code: 'ADMIN_RESET_PASS_FAILED', message: 'Error al resetear la contraseña' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }

  await supabaseAdmin.from('outbox').insert({
    event: 'ADMIN.USER.RESET_PASSWORD',
    module: 'ADMIN',
    payload: { targetUserId: body.userId, resetBy: adminCheck.userId },
  });

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  );
});
