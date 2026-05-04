import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { VerwaltungOptionsSchema, type VerwaltungOptions } from './options.js';
import { registerVerwaltungApi } from './api.js';

function parseOpts(ctx: ModuleContext): VerwaltungOptions {
  const parsed = VerwaltungOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[verwaltung] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const verwaltung: Module = {
  name: 'verwaltung',
  displayName: 'External property managers',
  version: '0.1.0',
  permissions: [
    { key: 'verwaltung', label: 'External property managers', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  localesDir: resolve(here, '..', 'locales'),

  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerVerwaltungApi(app, ctx, opts);
  },
};

export default verwaltung;
export { VerwaltungOptionsSchema, type VerwaltungOptions } from './options.js';
export type {
  VerwaltungRow,
  KontaktRow,
  VerwaltungWithKontakte,
  VerwaltungInput,
  KontaktInput,
  VerwaltungPublic,
} from './types.js';
