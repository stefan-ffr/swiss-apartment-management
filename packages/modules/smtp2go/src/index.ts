import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { Smtp2goOptionsSchema, type Smtp2goOptions } from './options.js';
import { registerSmtp2goApi } from './api.js';
import { registerWebhookEndpoint } from './inbound-webhook.js';
import { syncSuppressions } from './suppressions.js';

function parseOpts(ctx: ModuleContext): Smtp2goOptions {
  const parsed = Smtp2goOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[smtp2go] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const smtp2go: Module = {
  name: 'smtp2go',
  displayName: 'SMTP2GO integration',
  version: '0.1.0',
  permissions: [
    { key: 'smtp2go', label: 'SMTP2GO administration', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  localesDir: resolve(here, '..', 'locales'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerSmtp2goApi(app, ctx, opts);
    registerWebhookEndpoint(app, ctx, opts);
  },
  cron: [
    {
      name: 'suppressions-sync',
      schedule: { everyMs: 10 * 60 * 1000 },
      async run(ctx) {
        const opts = parseOpts(ctx);
        if (!opts.activityApi) return;
        await syncSuppressions(ctx, opts);
      },
    },
  ],
};

export default smtp2go;
export { Smtp2goOptionsSchema, type Smtp2goOptions } from './options.js';
export { createSmtp2goMailer } from './mailer.js';
export {
  registerWebhookEndpoint,
  setInboundHandler,
} from './inbound-webhook.js';
export { startGmailImapPoller } from './inbound-imap.js';
export {
  Smtp2goActivityClient,
  Smtp2goError,
  type SuppressionEntry,
} from './activity.js';
export { syncSuppressions, isSuppressed } from './suppressions.js';
export type {
  SendMailOptions,
  SendMailResult,
  InboundMessage,
  InboundHandler,
  SuppressionRow,
} from './types.js';
