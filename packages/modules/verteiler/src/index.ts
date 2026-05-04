import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import { VerteilerOptionsSchema, type VerteilerOptions } from './options.js';
import { registerVerteilerApi } from './api.js';

function parseOpts(ctx: ModuleContext): VerteilerOptions {
  const parsed = VerteilerOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[verteiler] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const verteiler: Module = {
  name: 'verteiler',
  displayName: 'Mailing-list distribution',
  version: '0.1.0',
  permissions: [
    { key: 'verteiler', label: 'Mailing lists', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  localesDir: resolve(here, '..', 'locales'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerVerteilerApi(app, ctx, opts);
  },
};

export default verteiler;
export { VerteilerOptionsSchema, type VerteilerOptions } from './options.js';
export { setServices, getServices, type VerteilerServices } from './services.js';
export { resolveRecipients } from './resolve.js';
export { logEmail, type EmailLogEntry } from './log.js';
export {
  processInbound,
  type InboundEnvelope,
  type InboundResult,
} from './inbound.js';
export type {
  VerteilerRow,
  VerteilerInput,
  EmailLogRow,
  GroupResolver,
  Mailer,
  SendMailOptions,
  SendMailResult,
} from './types.js';
