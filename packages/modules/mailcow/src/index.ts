import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { MailcowOptionsSchema, type MailcowOptions } from './options.js';
import { registerMailcowApi } from './api.js';

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
  version: '0.1.0',
  permissions: [
    { key: 'mailcow', label: 'Mailcow administration', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerMailcowApi(app, ctx, opts);
  },
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
