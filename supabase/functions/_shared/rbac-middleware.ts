import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ALLOWED_ORIGINS = [
  'https://logiscore-erp.vercel.app',
  'http://localhost:3000',
];

export function corsHeaders(reqOrigin: string): Record<string, string> {
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function decodeJWTPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function verifyAdmin(request: Request): Promise<
  { ok: true; userId: string; email: string; response: null }
  | { ok: false; userId: null; email: null; response: Response }
> {
  const origin = request.headers.get('origin') ?? '';
  const headers = corsHeaders(origin);

  const authHeader = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!authHeader) {
    return {
      ok: false, userId: null, email: null,
      response: new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token requerido' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      ),
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
  if (authError || !user) {
    return {
      ok: false, userId: null, email: null,
      response: new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token inválido o expirado' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      ),
    };
  }

  // El role se inyecta en el JWT via custom_access_token_hook, no en raw_app_meta_data
  // Decodificamos el JWT localmente para obtener app_metadata.role
  let role: string | undefined;
  try {
    const payload = decodeJWTPayload(authHeader);
    const jwtAppMeta = payload.app_metadata as Record<string, unknown> | undefined;
    role = jwtAppMeta?.role as string | undefined;
  } catch {
    role = user.app_metadata?.role as string | undefined;
  }

  if (role !== 'admin') {
    return {
      ok: false, userId: null, email: null,
      response: new Response(
        JSON.stringify({ code: 'ADMIN_ONLY', message: 'Solo el administrador puede ejecutar esta operación' }),
        { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } },
      ),
    };
  }

  return { ok: true, userId: user.id, email: user.email ?? '', response: null };
}

export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres';
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'La contraseña debe contener mayúscula, minúscula, número y símbolo';
  }
  return null;
}
