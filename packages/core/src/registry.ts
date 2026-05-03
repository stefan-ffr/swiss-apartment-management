import type { Express } from 'express';
import type { Pool } from 'pg';
import type { Module, ModuleContext, TenantConfig, AuthService, Logger } from './types.js';
import { runMigrations } from './migrate.js';

export interface RegistryOptions {
  config: TenantConfig;
  app: Express;
  db: Pool;
  auth: AuthService;
  logger: Logger;
}

export class ModuleRegistry {
  private readonly modules = new Map<string, Module>();
  private readonly opts: RegistryOptions;

  constructor(opts: RegistryOptions) {
    this.opts = opts;
  }

  /** Register a module instance. Throws if `name` is duplicated. */
  add(mod: Module): void {
    if (this.modules.has(mod.name)) {
      throw new Error(`Module already registered: ${mod.name}`);
    }
    this.modules.set(mod.name, mod);
  }

  /** Returns the modules that are listed AND enabled in tenant.config.json */
  enabled(): Module[] {
    return [...this.modules.values()].filter(m => {
      const entry = this.opts.config.modules[m.name];
      return entry?.enabled === true;
    });
  }

  /** Run migrations + register routes + schedule cron for all enabled modules */
  async start(): Promise<void> {
    const { app, config, db, auth, logger } = this.opts;
    for (const mod of this.enabled()) {
      const moduleOptions = config.modules[mod.name]?.options ?? {};
      const ctx: ModuleContext = { config, moduleOptions, db, logger, auth };

      if (mod.migrationsDir) {
        logger.info(`[${mod.name}] running migrations`);
        await runMigrations(db, mod.name, mod.migrationsDir);
      }
      if (mod.register) {
        logger.info(`[${mod.name}] registering routes`);
        await mod.register(app, ctx);
      }
      if (mod.cron && mod.cron.length > 0) {
        for (const job of mod.cron) {
          logger.info(`[${mod.name}] scheduling cron: ${job.name}`);
          this.scheduleCron(job, ctx, logger);
        }
      }
    }
  }

  private scheduleCron(job: NonNullable<Module['cron']>[number], ctx: ModuleContext, logger: Logger): void {
    if (typeof job.schedule === 'object' && 'everyMs' in job.schedule) {
      const everyMs = job.schedule.everyMs;
      setInterval(() => {
        job.run(ctx).catch(err => logger.error(`cron ${job.name} failed`, { err: String(err) }));
      }, everyMs).unref();
      return;
    }
    // TODO: add real cron-expression parser (e.g. node-cron) once needed
    logger.warn(`cron expressions not yet supported, skipping ${job.name}`);
  }
}
