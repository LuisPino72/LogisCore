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
    const body = await req.json().catch(() => ({}));
    const tenant_id = body?.tenant_id as string | undefined;

    const rateKey = tenant_id ?? 'global';
    if (!checkRateLimit(rateKey)) {
      return new Response(
        JSON.stringify({ code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Espera 60 segundos.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

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
        return new Response(
          JSON.stringify({ code: 'DB_UPSERT_ERROR', message: error.message }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .is('deleted_at', null);

    if (tenantError) {
      return new Response(
        JSON.stringify({ code: 'TENANTS_QUERY_ERROR', message: tenantError.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const results: { tenant_id: string; rate: number }[] = [];
    for (const tenant of tenants ?? []) {
      const { error: upsertError } = await supabaseAdmin
        .from('exchange_rates')
        .upsert(
          { tenant_id: tenant.id, rate, source: 'bcv_api', fetched_at: fetchedAt },
          { onConflict: 'tenant_id', ignoreDuplicates: false },
        );

      if (!upsertError) {
        results.push({ tenant_id: tenant.id, rate });
      }
    }

    return new Response(
      JSON.stringify({ rate, tenants: results.length, fetched_at: fetchedAt }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
