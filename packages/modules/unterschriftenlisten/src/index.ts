import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Module, ModuleContext } from '@sam/core';
import {
  UnterschriftenlistenOptionsSchema,
  type UnterschriftenlistenOptions,
} from './options.js';
import { registerUnterschriftenlistenApi } from './api.js';

function parseOpts(ctx: ModuleContext): UnterschriftenlistenOptions {
  const parsed = UnterschriftenlistenOptionsSchema.safeParse(ctx.moduleOptions ?? {});
  if (!parsed.success) {
    throw new Error(
      `[unterschriftenlisten] invalid module options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

const here = dirname(fileURLToPath(import.meta.url));

const unterschriftenlisten: Module = {
  name: 'unterschriftenlisten',
  displayName: 'Signature sheets / circular votes',
  version: '0.1.0',
  permissions: [
    { key: 'unterschriftenlisten', label: 'Signature sheets', scopes: ['read', 'write'] },
  ],
  migrationsDir: resolve(here, '..', 'migrations'),
  register(app, ctx) {
    const opts = parseOpts(ctx);
    registerUnterschriftenlistenApi(app, ctx, opts);
  },
};

export default unterschriftenlisten;
export {
  UnterschriftenlistenOptionsSchema,
  type UnterschriftenlistenOptions,
} from './options.js';
export type { SnapshotRow, RuecklaufRow, SnapshotInput, RuecklaufUpdate, Vote } from './types.js';
