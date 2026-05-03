import express from 'express';
import { Pool } from 'pg';
import { loadTenantConfig, ConfigError } from './config.js';
import { ModuleRegistry } from './registry.js';
import { consoleLogger } from './logger.js';
import { createStubAuth } from './auth.js';
import type { Module } from './types.js';

export * from './types.js';
export { loadTenantConfig, ConfigError } from './config.js';
export { ModuleRegistry } from './registry.js';
export { consoleLogger } from './logger.js';
export { runMigrations, ensureMigrationTable } from './migrate.js';
export { createAuthMiddleware, requirePermission, adminOnly, getUser } from './middleware.js';

export interface BootstrapOptions {
  /** Modules to register (already imported). Only those enabled in
   *  tenant.config.json are activated. */
  modules: Module[];
  /** Override config path (defaults to env TENANT_CONFIG or ./tenant.config.json) */
  configPath?: string;
  /** Port to listen on (defaults to env PORT or 3000) */
  port?: number;
}

/**
 * Convenience bootstrap. Apps that need more control should call the
 * pieces (loadTenantConfig, ModuleRegistry, etc.) directly.
 */
export async function bootstrap(opts: BootstrapOptions): Promise<void> {
  const logger = consoleLogger();
  const config = await loadTenantConfig(opts.configPath);
  logger.info(`Tenant: ${config.tenant.name} (${config.tenant.id})`);

  const dbPassword = process.env[config.database.passwordEnv];
  if (!dbPassword) {
    throw new ConfigError(`Env var ${config.database.passwordEnv} (database password) is not set`);
  }

  const db = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: dbPassword,
  });

  const auth = createStubAuth(config.auth);
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req, res) => res.json({ ok: true, tenant: config.tenant.id }));

  const registry = new ModuleRegistry({ config, app, db, auth, logger });
  for (const m of opts.modules) registry.add(m);
  await registry.start();

  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  app.listen(port, () => logger.info(`listening on :${port}`));
}
