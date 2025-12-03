export function hasAdminAccess(userEmail: string | undefined | null): boolean {
  if (!userEmail) return false;
  return userEmail.toLowerCase().endsWith('@demonflare.com');
}

export const RESTRICTED_VIEWS = ['smtp', 'payments', 'cdn', 'users'] as const;

export function canAccessView(userEmail: string | undefined | null, viewId: string): boolean {
  if (!RESTRICTED_VIEWS.includes(viewId as any)) {
    return true;
  }
  return hasAdminAccess(userEmail);
}
