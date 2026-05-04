import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { DruckerOptionsSchema, type DruckerOptions } from './options.js';
import { registerDruckerApi } from './api.js';
import { autoCancelStaleJobs } from './cron.js';

function parseOpts(ctx: ModuleContext): DruckerOptions {
  const parsed = DruckerOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[drucker] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const drucker: Module = {
  name: 'drucker',
  displayName: 'Print-job inbox',
  version: '0.1.0',
  permissions: [
    { key: 'drucker', label: 'Print jobs', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  localesDir: resolve(here, '..', 'locales'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerDruckerApi(app, ctx, opts);
  },
  cron: [
    {
      name: 'auto-cancel-stale',
      schedule: { everyMs: 24 * 60 * 60 * 1000 },
      async run(ctx) {
        await autoCancelStaleJobs(ctx, parseOpts(ctx));
      },
    },
  ],
};

export default drucker;
export { DruckerOptionsSchema, type DruckerOptions } from './options.js';
export { buildDruckerTag, isDruckerTag, isBareDruckerAddr, extractSlug } from './tag.js';
export type { PrintJobRow, PrintJobInput, PrintJobStatus, TagBuilder } from './types.js';
