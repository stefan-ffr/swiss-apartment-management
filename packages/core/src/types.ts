import type { Express, RequestHandler } from 'express';
import type { Pool } from 'pg';

/**
 * The contract every module must implement.
 *
 * The core loads enabled modules from `tenant.config.json#modules`,
 * runs their migrations, registers their HTTP routes and schedules
 * their cron jobs.
 */
export interface Module {
  /** Stable identifier, must match the key in `tenant.config.json#modules` */
  name: string;

  /** Human-readable name for admin UIs */
  displayName?: string;

  /** Semver of the module package */
  version: string;

  /** Permission keys this module declares (used by the auth layer) */
  permissions?: PermissionDescriptor[];

  /** Path to a directory containing SQL migration files (`001-init.sql`, ...) */
  migrationsDir?: string;

  /** Register Express routes. Called once at startup. */
  register?(app: Express, ctx: ModuleContext): void | Promise<void>;

  /** Cron jobs to schedule */
  cron?: CronJob[];

  /** Health check; should return quickly */
  healthcheck?(ctx: ModuleContext): Promise<HealthStatus>;
}

export interface ModuleContext {
  config: TenantConfig;
  moduleOptions: Record<string, unknown>;
  db: Pool;
  logger: Logger;
  auth: AuthService;
  /** Pre-built middleware factories. Modules use these instead of
   *  rolling their own so the host can swap the AuthService. */
  middleware: {
    authenticated: RequestHandler;
    requirePermission(key: string, scope?: 'read' | 'write'): RequestHandler;
    adminOnly: RequestHandler;
  };
}

export interface PermissionDescriptor {
  key: string;
  label: string;
  scopes?: ('read' | 'write')[];
}

export interface CronJob {
  name: string;
  /** Cron expression OR interval-ms shorthand */
  schedule: string | { everyMs: number };
  run(ctx: ModuleContext): Promise<void>;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Auth service abstraction. The default implementation talks to
 * Authentik via OIDC, but tenants can swap in any compatible OIDC
 * provider.
 */
export interface AuthService {
  /** Verify session/JWT and return the user, or null if invalid */
  verify(req: unknown): Promise<AuthUser | null>;

  /** Permission lookup */
  hasPermission(user: AuthUser, key: string, scope?: 'read' | 'write'): boolean;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  groups: string[];
  isAdmin: boolean;
}

/** Validated, parsed tenant config (post-Zod) */
export interface TenantConfig {
  tenant: { id: string; name: string; domain: string; locale: string; timezone: string };
  stwegen: StwegConfig[];
  auth: AuthConfig;
  database: DbConfig;
  smtp?: SmtpConfig;
  storage: StorageConfig;
  modules: Record<string, ModuleEntry>;
  branding?: BrandingConfig;
}

export interface StwegConfig {
  nr: number;
  name: string;
  addresses: string[];
  groups: { bewohner?: string; eigentuemer?: string; ausschuss?: string };
  type: 'wohnung' | 'tiefgarage' | 'sonstiges';
}

export interface AuthConfig {
  provider: 'authentik' | 'oidc';
  issuerUrl: string;
  externalUrl: string;
  internalUrl?: string;
  clientId: string;
  clientSecret: string;
  adminGroups: string[];
}

export interface DbConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  passwordEnv: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  passwordEnv: string;
  from: string;
}

export interface StorageConfig {
  type: 'local' | 'cifs' | 's3';
  path?: string;
  // type-specific options handled at use-site
  [key: string]: unknown;
}

export interface ModuleEntry {
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface BrandingConfig {
  logoPath?: string;
  primaryColor?: string;
  favicon?: string;
}
