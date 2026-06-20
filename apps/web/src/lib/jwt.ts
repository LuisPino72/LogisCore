// Shared JWT utilities — NO module dependencies, pure functions only

function decodeJWTPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    const payload = parts[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function isJWTExpired(token: string): boolean {
  const decoded = decodeJWTPayload(token);
  const exp = decoded.exp as number | undefined;
  if (!exp) return false;
  return Date.now() > exp * 1000;
}

export function extractRole(session: { access_token: string } | null): string | null {
  if (!session) return null;
  if (isJWTExpired(session.access_token)) return null;
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  const jwtRole = jwtAppMeta?.role as string | undefined;
  if (jwtRole) return jwtRole;
  return (decoded.role as string) ?? null;
}

export function extractTenantId(session: { access_token: string } | null): string | null {
  if (!session) return null;
  if (isJWTExpired(session.access_token)) return null;
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  const jwtTenantId = jwtAppMeta?.tenant_id as string | undefined;
  if (jwtTenantId) return jwtTenantId;
  return (decoded.tenant_id as string) ?? null;
}

export function extractRoleName(session: { access_token: string } | null): string | undefined {
  if (!session) return undefined;
  if (isJWTExpired(session.access_token)) return undefined;
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  return jwtAppMeta?.role_name as string | undefined;
}

export function extractPermissions(session: { access_token: string } | null): string[] | undefined {
  if (!session) return undefined;
  if (isJWTExpired(session.access_token)) return undefined;
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  const perms = jwtAppMeta?.permissions as string[] | undefined;
  return perms && perms.length > 0 ? perms : undefined;
}

export { decodeJWTPayload, isJWTExpired };
