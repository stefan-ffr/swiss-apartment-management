import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { WohnungenOptionsSchema, type WohnungenOptions } from './options.js';
import { registerWohnungenApi } from './api.js';
import { autoArchiveSupersededKontakte } from './cron.js';

function parseOpts(ctx: ModuleContext): WohnungenOptions {
  const parsed = WohnungenOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[wohnungen] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const wohnungen: Module = {
  name: 'wohnungen',
  displayName: 'Apartments & Residents',
  version: '0.1.0',
  permissions: [
    { key: 'wohnungen', label: 'Apartments & residents', scopes: ['read', 'write'] },
    { key: 'wohnungen-historie', label: 'Apartments contact history', scopes: ['read'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),

  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerWohnungenApi(app, ctx, opts);
  },

  cron: [
    {
      name: 'auto-archive-superseded',
      schedule: { everyMs: 24 * 60 * 60 * 1000 },
      run: autoArchiveSupersededKontakte,
    },
  ],
};

export default wohnungen;
export { WohnungenOptionsSchema, type WohnungenOptions } from './options.js';
export { loadWohnungMitKontakte } from './load.js';
export { saveKontakte } from './kontakte.js';
export { autoArchiveSupersededKontakte } from './cron.js';
export type { WohnungRow, KontaktRow, KontaktInput, WohnungWithKontakte, Rolle, BewohntVon } from './types.js';
