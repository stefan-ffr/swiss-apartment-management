import type { Module, ModuleContext } from '@sam/core';
import { TelefonbuchOptionsSchema, type TelefonbuchOptions } from './options.js';
import { registerTelefonbuchApi } from './api.js';
import { syncContactsToCardDav } from './sync.js';

function parseOpts(ctx: ModuleContext): TelefonbuchOptions {
  const parsed = TelefonbuchOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[telefonbuch] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const telefonbuch: Module = {
  name: 'telefonbuch',
  displayName: 'Phonebook',
  version: '0.1.0',
  permissions: [
    { key: 'telefonbuch', label: 'Phonebook', scopes: ['read'] },
  ],
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerTelefonbuchApi(app, ctx, opts);

    const { authenticated, adminOnly } = ctx.middleware;
    app.post('/api/telefonbuch/sync', authenticated, adminOnly, (_req, res) => {
      syncContactsToCardDav(ctx, opts).catch((err) =>
        ctx.logger.error('[telefonbuch] manual sync failed', { err: (err as Error).message }),
      );
      res.json({ triggered: true });
    });
  },
  cron: [
    {
      name: 'carddav-sync',
      schedule: { everyMs: 60 * 60 * 1000 },
      async run(ctx) {
        const opts = parseOpts(ctx);
        await syncContactsToCardDav(ctx, opts);
      },
    },
  ],
};

export default telefonbuch;
export { TelefonbuchOptionsSchema, type TelefonbuchOptions };
