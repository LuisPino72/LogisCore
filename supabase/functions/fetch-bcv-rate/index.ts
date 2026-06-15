import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/rbac-middleware.ts';

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const lastCall = rateLimitMap.get(key) ?? 0;
  if (now - lastCall < RATE_LIMIT_WINDOW_MS) return false;
  rateLimitMap.set(key, now);
  return true;
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

interface BcvApiRate {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
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

  try {
    // === AUTENTICACIÓN: Verificar JWT ===
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token requerido' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token inválido o expirado' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Extraer tenant_id del JWT (inyectado por custom_access_token_hook)
    let jwtTenantId: string | undefined;
    try {
      const payload = decodeJWTPayload(authHeader);
      const appMeta = payload.app_metadata as Record<string, unknown> | undefined;
      jwtTenantId = appMeta?.tenant_id as string | undefined;
    } catch {
      // Si no se puede decodificar, continuar sin tenant (bulk update solo admin)
    }

    // === RATE LIMITING ===
    const body = await req.json().catch(() => ({}));
    const requestTenantId = body?.tenant_id as string | undefined;

    // Si se proporciona tenant_id en el body, verificar que coincida con el JWT
    if (requestTenantId) {
      if (!jwtTenantId) {
        return new Response(
          JSON.stringify({ code: 'FORBIDDEN', message: 'No se pudo determinar tu tenant' }),
          { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
      if (requestTenantId !== jwtTenantId) {
        return new Response(
          JSON.stringify({ code: 'TENANT_MISMATCH', message: 'No puedes modificar la tasa de otro tenant' }),
          { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Usar el tenant_id del JWT como source of truth
    const tenant_id = jwtTenantId;

    const rateKey = tenant_id ?? 'global';
    if (!checkRateLimit(rateKey)) {
      return new Response(
        JSON.stringify({ code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Espera 60 segundos.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // === FETCH BCV RATE ===
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let bcvRes: Response;
    try {
      bcvRes = await fetch('https://ve.dolarapi.com/v1/dolares', {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const message = fetchErr instanceof DOMException && fetchErr.name === 'AbortError'
        ? 'El API del BCV no respondió en 10 segundos.'
        : 'Error de conexión al consultar API del BCV';
      return new Response(
        JSON.stringify({ code: 'BCV_API_ERROR', message }),
        { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }
    clearTimeout(timeout);

    if (!bcvRes.ok) {
      return new Response(
        JSON.stringify({ code: 'BCV_API_ERROR', message: 'Error al consultar API del BCV' }),
        { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const rates: BcvApiRate[] = await bcvRes.json();
    const oficialRate = rates.find((r) => r.fuente === 'oficial');

    if (!oficialRate || !oficialRate.promedio || oficialRate.promedio <= 0) {
      return new Response(
        JSON.stringify({ code: 'BCV_INVALID_RATE', message: 'Tasa BCV inválida desde API' }),
        { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const rate = oficialRate.promedio;
    const fetchedAt = oficialRate.fechaActualizacion ?? new Date().toISOString();

    // === UPSERT: Solo para el tenant autenticado ===
    if (tenant_id) {
      const { data, error } = await supabaseAdmin
        .from('exchange_rates')
        .upsert(
          { tenant_id, rate, source: 'bcv_api', fetched_at: fetchedAt },
          { onConflict: 'tenant_id', ignoreDuplicates: false },
        )
        .select('id, rate, source, fetched_at, created_at')
        .single();

      if (error) {
        console.error('[fetch-bcv-rate] dbError:', error.message);
        return new Response(
          JSON.stringify({ code: 'DB_UPSERT_ERROR', message: 'Error al guardar la tasa de cambio' }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Sin tenant_id del JWT — no permitir bulk update (seguridad)
    return new Response(
      JSON.stringify({ code: 'TENANT_REQUIRED', message: 'No se pudo determinar el tenant' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[fetch-bcv-rate] unexpected:', err);
    return new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
