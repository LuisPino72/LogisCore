import type { TenantInfo } from '@logiscore/core';
import { AppError } from '@logiscore/core';
import { supabase } from './supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cache = new Map<string, string>();

export class TenantTranslator {
  static async slugToUuid(slug: string): Promise<string> {
    // If the "slug" is actually a UUID, use it directly
    if (UUID_RE.test(slug)) {
      cache.set(slug, slug);
      return slug;
    }

    const cached = this.findInCache(slug);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new AppError('TENANT_TRANSLATION_FAILED', `No se encontró tenant con slug: ${slug}`);
    }

    cache.set(slug, data.id);
    return data.id;
  }

  static async uuidToSlug(uuid: string): Promise<string> {
    for (const [slug, id] of cache) {
      if (id === uuid) return slug;
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

    cache.set(data.slug, uuid);
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

  private static findInCache(slug: string): string | undefined {
    return cache.get(slug);
  }
}
