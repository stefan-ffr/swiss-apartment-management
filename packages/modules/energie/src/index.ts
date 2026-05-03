import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { EnergieOptionsSchema, type EnergieOptions } from './options.js';
import { registerEnergieApi } from './api.js';

function parseOpts(ctx: ModuleContext): EnergieOptions {
  const parsed = EnergieOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[energie] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const energie: Module = {
  name: 'energie',
  displayName: 'Energy & utility metering',
  version: '0.1.0',
  permissions: [
    { key: 'energie', label: 'Energy meters', scopes: ['read'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerEnergieApi(app, ctx, opts);
  },
};

export default energie;
export { EnergieOptionsSchema, type EnergieOptions } from './options.js';
export type { MeterRow, ReadingRow, TariffRow, ReadingInput, MeterType } from './types.js';
