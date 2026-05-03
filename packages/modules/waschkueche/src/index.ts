import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { WaschkuecheOptionsSchema, type WaschkuecheOptions } from './options.js';
import { registerWaschkuecheApi } from './api.js';

function parseOpts(ctx: ModuleContext): WaschkuecheOptions {
  const parsed = WaschkuecheOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[waschkueche] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const waschkueche: Module = {
  name: 'waschkueche',
  displayName: 'Laundry-room booking',
  version: '0.1.0',
  permissions: [
    { key: 'waschkueche', label: 'Laundry-room booking', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerWaschkuecheApi(app, ctx, opts);
  },
};

export default waschkueche;
export { WaschkuecheOptionsSchema, type WaschkuecheOptions } from './options.js';
export type { RoomRow, ReservationRow, SessionRow, ReservationInput } from './types.js';
