import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthService, AuthUser } from './types.js';

/** Property name we attach the resolved user under on Express requests. */
const USER_KEY = '__samUser';

/** Typed accessor — modules use this instead of `req.user`. */
export function getUser(req: Request): AuthUser | undefined {
  return (req as Request & Record<string, unknown>)[USER_KEY] as AuthUser | undefined;
}

function setUser(req: Request, u: AuthUser): void {
  (req as Request & Record<string, unknown>)[USER_KEY] = u;
}

/**
 * Middleware factory: verifies the request via the AuthService and
 * attaches the user. If verification fails, responds 401.
 *
 * Routes that should remain public must skip this middleware.
 */
export function createAuthMiddleware(auth: AuthService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await auth.verify(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    setUser(req, user);
    next();
  };
}

/**
 * Middleware: require a specific permission (with optional scope).
 * Must run AFTER `createAuthMiddleware`.
 */
export function requirePermission(
  auth: AuthService,
  key: string,
  scope?: 'read' | 'write',
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!auth.hasPermission(user, key, scope)) {
      res.status(403).json({ error: `Missing permission: ${key}${scope ? `:${scope}` : ''}` });
      return;
    }
    next();
  };
}

/** Convenience: 403 unless the resolved user is an admin. */
export function adminOnly(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user?.isAdmin) {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    next();
  };
}
