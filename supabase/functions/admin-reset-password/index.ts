// Edge Function: admin-reset-password (SPEC-ID: ADMIN-007)
// Resetea la contraseña de un owner o employee desde el AdminPanel.
// Solo el admin (role=admin + email hardcodeado) puede ejecutar esta operación.
// NO permite resetear contraseñas de otros admins.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

  // 2. Double verification: solo admin puede resetear passwords
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin' || user.email !== ADMIN_EMAIL) {
    return new Response(
      JSON.stringify({ code: 'ADMIN_ONLY', message: 'Solo el administrador puede resetear contraseñas' }),
      { status: 403, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 3. Parse request body
  let body: { userId: string; newPassword: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'JSON inválido' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  if (!body.userId || !body.newPassword || body.newPassword.length < 6) {
    return new Response(
      JSON.stringify({ code: 'INVALID_PASSWORD', message: 'La contraseña debe tener al menos 6 caracteres' }),
      { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 4. Verify target user is NOT an admin (solo owner/employee pueden ser reseteados)
  const { data: targetRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', body.userId)
    .single();

  if (!targetRole) {
    return new Response(
      JSON.stringify({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' }),
      { status: 404, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  if (targetRole.role === 'admin') {
    return new Response(
      JSON.stringify({ code: 'RESET_PASS_FORBIDDEN', message: 'No puedes resetear la contraseña de otro administrador' }),
      { status: 403, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 5. Reset password using service_role
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    body.userId,
    { password: body.newPassword },
  );

  if (updateError) {
    return new Response(
      JSON.stringify({ code: 'ADMIN_RESET_PASS_FAILED', message: `Error al resetear contraseña: ${updateError.message}` }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }

  // 6. Log audit event
  await supabaseAdmin.from('outbox').insert({
    event: 'ADMIN.USER.RESET_PASSWORD',
    module: 'ADMIN',
    payload: { targetUserId: body.userId, resetBy: user.id },
  });

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
  );
});
