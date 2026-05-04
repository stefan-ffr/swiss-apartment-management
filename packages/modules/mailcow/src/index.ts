import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { MailcowOptionsSchema, type MailcowOptions } from './options.js';
import { registerMailcowApi } from './api.js';
import { syncVerteilerAliases, syncDruckerAliases } from './bridges/index.js';
import { VerteilerOptionsSchema } from '@sam/module-verteiler';
import { DruckerOptionsSchema } from '@sam/module-drucker';

function parseOpts(ctx: ModuleContext): MailcowOptions {
  const parsed = MailcowOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[mailcow] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const mailcow: Module = {
  name: 'mailcow',
  displayName: 'Mailcow integration',
  version: '0.2.0',
  permissions: [
    { key: 'mailcow', label: 'Mailcow administration', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  localesDir: resolve(here, '..', 'locales'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerMailcowApi(app, ctx, opts);
  },
  cron: [
    {
      // Periodic re-sync of verteiler → Mailcow aliases. Disabled by default.
      // The interval at registration time is read from the parsed options;
      // with `bridges.verteiler.enabled = false` the run() exits immediately.
      name: 'bridge-verteiler',
      schedule: { everyMs: 15 * 60 * 1000 },
      async run(ctx) {
        const opts = parseOpts(ctx);
        if (!opts.bridges.verteiler.enabled) return;
        const v = ctx.config.modules.verteiler;
        if (!v?.enabled) return;
        const parsed = VerteilerOptionsSchema.safeParse(v.options ?? {});
        if (!parsed.success) {
          ctx.logger.warn('[mailcow.cron.verteiler] verteiler options invalid, skipping');
          return;
        }
        await syncVerteilerAliases(ctx, opts, {
          verteilerOptions: parsed.data,
          auditBcc: opts.bridges.verteiler.auditBcc,
          maxRecipientsPerAlias: opts.bridges.verteiler.maxRecipientsPerAlias,
        });
      },
    },
    {
      name: 'bridge-drucker',
      schedule: { everyMs: 15 * 60 * 1000 },
      async run(ctx) {
        const opts = parseOpts(ctx);
        if (!opts.bridges.drucker.enabled) return;
        const ingest = opts.bridges.drucker.ingestAddress;
        if (!ingest) return;
        const d = ctx.config.modules.drucker;
        if (!d?.enabled) return;
        const parsed = DruckerOptionsSchema.safeParse(d.options ?? {});
        if (!parsed.success) {
          ctx.logger.warn('[mailcow.cron.drucker] drucker options invalid, skipping');
          return;
        }
        await syncDruckerAliases(ctx, opts, {
          druckerOptions: parsed.data,
          ingestAddress: ingest,
        });
      },
    },
  ],
};

export default mailcow;
export { MailcowOptionsSchema, type MailcowOptions } from './options.js';
export {
  MailcowClient,
  MailcowError,
  type MailcowMailbox,
  type MailcowAlias,
  type AddMailboxInput,
  type AddAliasInput,
} from './client.js';
export {
  provisionMailbox,
  deactivateMailbox,
  ensureAlias,
  deleteAlias,
  ensurePurposeMailbox,
  type ProvisionMailboxInput,
  type ProvisionMailboxResult,
} from './sync.js';
export {
  createMailcowMailer,
  type SendMailOptions,
  type SendMailResult,
} from './mailer.js';
export {
  startImapPoller,
  type InboundMessage,
  type InboundHandler,
} from './imap.js';
export {
  syncVerteilerAliases,
  syncDruckerAliases,
  type VerteilerBridgeOptions,
  type DruckerBridgeOptions,
  type BridgeStats,
} from './bridges/index.js';
