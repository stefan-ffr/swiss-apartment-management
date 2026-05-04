import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthService, AuthUser } from './types.js';
import { pickAcceptLanguage, type Locale, type Translator } from './i18n.js';

/** Translator+key → string. Used by middleware for error responses. */
function translateError(
  translator: Translator | undefined,
  req: Request,
  key: string,
  fallback: string,
  params?: Record<string, unknown>,
): string {
  if (!translator) return params ? interpolate(fallback, params) : fallback;
  return translator.t(key, getLocale(req), params);
}

function interpolate(s: string, params: Record<string, unknown>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/** Property name we attach the resolved user under on Express requests. */
const USER_KEY = '__samUser';
const LOCALE_KEY = '__samLocale';

/** Typed accessor — modules use this instead of `req.user`. */
export function getUser(req: Request): AuthUser | undefined {
  return (req as Request & Record<string, unknown>)[USER_KEY] as AuthUser | undefined;
}

function setUser(req: Request, u: AuthUser): void {
  (req as Request & Record<string, unknown>)[USER_KEY] = u;
}

/** Get the resolved locale for this request (undefined before middleware). */
export function getLocale(req: Request): Locale | undefined {
  return (req as Request & Record<string, unknown>)[LOCALE_KEY] as Locale | undefined;
}

function setLocale(req: Request, l: Locale): void {
  (req as Request & Record<string, unknown>)[LOCALE_KEY] = l;
}

/**
 * Middleware factory: resolves the request's locale from
 * Accept-Language and stores it on the request. Resolution chain:
 *   1) Accept-Language header parsed against `supportedLocales`
 *   2) `tenantDefaultLocale`
 *   3) 'en'
 */
export function localeMiddleware(opts: {
  supportedLocales: Locale[];
  tenantDefaultLocale: Locale;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const acceptHeader = req.header('accept-language');
    const picked =
      pickAcceptLanguage(acceptHeader, opts.supportedLocales) ??
      opts.tenantDefaultLocale ??
      'en';
    setLocale(req, picked);
    next();
  };
}

/**
 * Middleware factory: verifies the request via the AuthService and
 * attaches the user. If verification fails, responds 401.
 *
 * Routes that should remain public must skip this middleware.
 *
 * The optional `translator` argument lets the middleware emit
 * localised error messages — when absent, English fallbacks are used.
 */
export function createAuthMiddleware(
  auth: AuthService,
  translator?: Translator,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await auth.verify(req);
    if (!user) {
      res.status(401).json({
        error: translateError(translator, req, 'common.errors.unauthorized', 'Authentication required.'),
      });
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
  translator?: Translator,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({
        error: translateError(translator, req, 'common.errors.unauthorized', 'Authentication required.'),
      });
      return;
    }
    if (!auth.hasPermission(user, key, scope)) {
      const permString = `${key}${scope ? `:${scope}` : ''}`;
      res.status(403).json({
        error: translateError(translator, req, 'common.errors.missingPermission', `Missing permission: ${permString}.`, { permission: permString }),
      });
      return;
    }
    next();
  };
}

/** Convenience: 403 unless the resolved user is an admin. */
export function adminOnly(translator?: Translator): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user?.isAdmin) {
      res.status(403).json({
        error: translateError(translator, req, 'common.errors.adminOnly', 'Admin only.'),
      });
      return;
    }
    next();
  };
}
