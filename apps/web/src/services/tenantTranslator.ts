import type { TenantInfo } from '@logiscore/core';
import { AppError } from '@logiscore/core';
import { supabase } from './supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export class TenantTranslator {
  static async slugToUuid(slug: string): Promise<string> {
    if (UUID_RE.test(slug)) {
      cache.set(slug, { value: slug, expiresAt: Date.now() + CACHE_TTL });
      return slug;
    }

    const cached = cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new AppError('TENANT_TRANSLATION_FAILED', `No se encontró tenant con slug: ${slug}`);
    }

    cache.set(slug, { value: data.id, expiresAt: Date.now() + CACHE_TTL });
    return data.id;
  }

  static async uuidToSlug(uuid: string): Promise<string> {
    const now = Date.now();
    for (const [slug, entry] of cache) {
      if (entry.value === uuid && entry.expiresAt > now) return slug;
    }

    const { data, error } = await supabase
      .from('tenants')
      .select('slug, name')
      .eq('id', uuid)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new AppError('TENANT_TRANSLATION_FAILED', `No se encontró tenant con id: ${uuid}`);
    }

    cache.set(data.slug, { value: uuid, expiresAt: now + CACHE_TTL });
    return data.slug;
  }

  static async getTenantInfo(uuid: string): Promise<TenantInfo> {
    await this.uuidToSlug(uuid);

    const { data, error } = await supabase
      .from('tenants')
      .select('id, slug, name')
      .eq('id', uuid)
      .single();

    if (error || !data) {
      throw new AppError('TENANT_NOT_FOUND', `Tenant no encontrado: ${uuid}`);
    }

    return { id: data.id, slug: data.slug, name: data.name };
  }

  static clearCache(): void {
    cache.clear();
  }
}
