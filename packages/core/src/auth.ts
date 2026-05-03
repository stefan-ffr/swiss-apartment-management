import type { AuthService, AuthUser, AuthConfig } from './types.js';

/**
 * Stub auth service. Real implementation will validate OIDC ID-tokens
 * against `authConfig.issuerUrl` (Authentik or any OIDC provider).
 *
 * For local dev you can set `SAM_DEV_USER='{"sub":"dev","email":"dev@local",...}'`
 * and the stub returns that user from `verify()`.
 */
export function createStubAuth(authConfig: AuthConfig): AuthService {
  return {
    async verify(_req: unknown): Promise<AuthUser | null> {
      const raw = process.env.SAM_DEV_USER;
      if (!raw) return null;
      try {
        const u = JSON.parse(raw) as Partial<AuthUser>;
        if (!u.sub || !u.email) return null;
        const groups = u.groups ?? [];
        return {
          sub: u.sub,
          email: u.email,
          name: u.name ?? u.email,
          groups,
          isAdmin: groups.some(g => authConfig.adminGroups.includes(g.toLowerCase())),
        };
      } catch {
        return null;
      }
    },
    hasPermission(user, _key, _scope) {
      // Stub: admins get everything, others nothing. Real impl: per-permission lookup.
      return user.isAdmin;
    },
  };
}
