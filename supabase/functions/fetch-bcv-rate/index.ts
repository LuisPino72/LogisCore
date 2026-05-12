// Edge Function: fetch-bcv-rate (SPEC-ID: DASH-001)
// Consulta API de tasa BCV, inserta en exchange_rates y retorna la tasa.
// Si se envía tenant_id -> inserta solo para ese tenant.
// Si NO se envía tenant_id -> inserta para TODOS los tenants (modo cron).
// Ejecutada con service_role para insertar en la tabla.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
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

interface BcvApiResponse {
  fecha?: string;
  promedio?: number;
  promedio_real?: number;
  codigo?: string;
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

  try {
    const body = await req.json().catch(() => ({}));
    const tenant_id = body?.tenant_id as string | undefined;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Fetch BCV rate from dolarapi.com
    const bcvRes = await fetch('https://ve.dolarapi.com/v1/dolares', {
      headers: { 'Accept': 'application/json' },
    });

    if (!bcvRes.ok) {
      return new Response(
        JSON.stringify({ code: 'BCV_API_ERROR', message: 'Error al consultar API del BCV' }),
        { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
      );
    }

    const rates: BcvApiRate[] = await bcvRes.json();
    const oficialRate = rates.find((r) => r.fuente === 'oficial');

    if (!oficialRate || !oficialRate.promedio || oficialRate.promedio <= 0) {
      return new Response(
        JSON.stringify({ code: 'BCV_INVALID_RATE', message: 'Tasa BCV inválida desde API' }),
        { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
      );
    }

    const rate = oficialRate.promedio;
    const fetchedAt = oficialRate.fechaActualizacion ?? new Date().toISOString();

    if (tenant_id) {
      // Upsert: reemplaza la tasa existente para este tenant
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
          { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
      );
    }

    // Upsert for ALL tenants (modo cron)
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .is('deleted_at', null);

    if (tenantError) {
      return new Response(
        JSON.stringify({ code: 'TENANTS_QUERY_ERROR', message: tenantError.message }),
        { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
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
      { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } },
    );
  }
});
