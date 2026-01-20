// In-memory cache for RBAC checks
const rbacCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export function hasAdminAccess(userEmail: string | undefined | null): boolean {
  if (!userEmail) return false;
  
  const cacheKey = `admin:${userEmail.toLowerCase()}`;
  const now = Date.now();
  const cached = rbacCache.get(cacheKey);
  
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.result;
  }

  const result = userEmail.toLowerCase().endsWith('@demonflare.com');
  rbacCache.set(cacheKey, { result, timestamp: now });
  return result;
}

export const RESTRICTED_VIEWS = ['smtp', 'payments', 'cdn', 'users'] as const;

export function canAccessView(userEmail: string | undefined | null, viewId: string): boolean {
  if (!RESTRICTED_VIEWS.includes(viewId as any)) {
    return true;
  }

  const cacheKey = `view:${userEmail?.toLowerCase() || 'anon'}:${viewId}`;
  const now = Date.now();
  const cached = rbacCache.get(cacheKey);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.result;
  }

  const result = hasAdminAccess(userEmail);
  rbacCache.set(cacheKey, { result, timestamp: now });
  return result;
}
