/**
 * Convenience helpers for keeping Mailcow in sync with SAM-managed
 * data. The host calls these — typical hooks:
 *
 *   - When a new Eigentümer/Mieter is added in @sam/module-wohnungen
 *     and `authentik_zugang === true`, also provision a mailbox.
 *   - When a contact is archived, deactivate the mailbox.
 *   - When a verteiler list is created in @sam/module-verteiler,
 *     ensure a Mailcow alias exists pointing to the catch-all.
 */
import type { ModuleContext } from '@sam/core';
import type { MailcowOptions } from './options.js';
import { MailcowClient } from './client.js';
import { randomBytes } from 'node:crypto';

export interface ProvisionMailboxInput {
  /** Local part (without @domain). Will be lowercased. */
  localPart: string;
  /** Domain — defaults to options.defaultDomain */
  domain?: string;
  /** Display name */
  name: string;
  /** OIDC sub of the user this mailbox belongs to (optional) */
  userSub?: string;
  /** Quota in MB — defaults to options.defaultQuotaMb */
  quotaMb?: number;
  /** When provided, set this password; otherwise generate a strong one
   *  and return it. */
  password?: string;
  /** Purpose tag for system-owned mailboxes (e.g. "printer-ingest",
   *  "verteiler-log", "bounces"). User mailboxes leave this null. */
  purpose?: string;
}

export interface ProvisionMailboxResult {
  address: string;
  password: string;
  created: boolean;
}

export async function provisionMailbox(
  ctx: ModuleContext,
  opts: MailcowOptions,
  input: ProvisionMailboxInput,
): Promise<ProvisionMailboxResult> {
  const client = new MailcowClient(opts);
  const domain = (input.domain ?? opts.defaultDomain).toLowerCase();
  const local = input.localPart.toLowerCase().replace(/[^a-z0-9._+-]/g, '');
  const address = `${local}@${domain}`;
  const password = input.password ?? randomBytes(18).toString('base64url');
  const quota = input.quotaMb ?? opts.defaultQuotaMb;

  let created = false;
  const existing = await client.getMailbox(address);
  if (!existing) {
    await client.addMailbox({
      local_part: local,
      domain,
      name: input.name,
      password,
      password2: password,
      quota,
      active: 1,
    });
    created = true;
  } else if (input.password) {
    await client.setMailboxPassword(address, password);
  }

  await ctx.db.query(
    `INSERT INTO mailcow_managed_mailboxes (address, name, quota_mb, user_sub, purpose, active, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (address) DO UPDATE
       SET name = EXCLUDED.name,
           quota_mb = EXCLUDED.quota_mb,
           user_sub = COALESCE(EXCLUDED.user_sub, mailcow_managed_mailboxes.user_sub),
           purpose = COALESCE(EXCLUDED.purpose, mailcow_managed_mailboxes.purpose),
           active = TRUE,
           last_seen_at = NOW()`,
    [address, input.name, quota, input.userSub ?? null, input.purpose ?? null],
  );

  return { address, password, created };
}

export async function deactivateMailbox(
  ctx: ModuleContext,
  opts: MailcowOptions,
  address: string,
): Promise<boolean> {
  // Only operate on mailboxes WE manage — never touch foreign accounts
  const r = await ctx.db.query<{ address: string }>(
    'SELECT address FROM mailcow_managed_mailboxes WHERE LOWER(address) = LOWER($1) AND active = TRUE',
    [address],
  );
  if (r.rowCount === 0) return false;

  const client = new MailcowClient(opts);
  await client.setMailboxActive(address, false);
  await ctx.db.query(
    'UPDATE mailcow_managed_mailboxes SET active = FALSE WHERE LOWER(address) = LOWER($1)',
    [address],
  );
  return true;
}

export async function ensureAlias(
  ctx: ModuleContext,
  opts: MailcowOptions,
  address: string,
  goto: string,
  purpose?: string,
): Promise<{ created: boolean }> {
  const client = new MailcowClient(opts);
  const existing = (await client.listAliases()).find(
    (a) => a.address.toLowerCase() === address.toLowerCase(),
  );
  let created = false;
  if (!existing) {
    await client.addAlias({ address, goto, active: 1 });
    created = true;
  }
  await ctx.db.query(
    `INSERT INTO mailcow_managed_aliases (address, goto, purpose, active, last_seen_at)
     VALUES ($1, $2, $3, TRUE, NOW())
     ON CONFLICT (address) DO UPDATE
       SET goto = EXCLUDED.goto,
           purpose = COALESCE(EXCLUDED.purpose, mailcow_managed_aliases.purpose),
           active = TRUE,
           last_seen_at = NOW()`,
    [address, goto, purpose ?? null],
  );
  return { created };
}

/**
 * Idempotently ensure a system-owned mailbox exists for one of the
 * receive functions of SAM (printer-ingest, verteiler-log, bounces, …).
 *
 * The password is read from `<purpose-uppercased>_PASSWORD_ENV` if
 * set, otherwise generated and returned to the caller. Hosts should
 * persist the returned password in their secret store on first run.
 */
export async function ensurePurposeMailbox(
  ctx: ModuleContext,
  opts: MailcowOptions,
  input: {
    purpose: string;
    localPart: string;
    name?: string;
    domain?: string;
    quotaMb?: number;
    /** Read existing password from this env var; otherwise generate. */
    passwordEnv?: string;
  },
): Promise<ProvisionMailboxResult> {
  const password = input.passwordEnv ? process.env[input.passwordEnv] : undefined;
  return provisionMailbox(ctx, opts, {
    localPart: input.localPart,
    domain: input.domain,
    name: input.name ?? `SAM ${input.purpose}`,
    quotaMb: input.quotaMb,
    password,
    purpose: input.purpose,
  });
}

export async function deleteAlias(
  ctx: ModuleContext,
  opts: MailcowOptions,
  address: string,
): Promise<boolean> {
  const r = await ctx.db.query<{ address: string }>(
    'SELECT address FROM mailcow_managed_aliases WHERE LOWER(address) = LOWER($1) AND active = TRUE',
    [address],
  );
  if (r.rowCount === 0) return false;
  const client = new MailcowClient(opts);
  await client.deleteAlias([address]);
  await ctx.db.query(
    'UPDATE mailcow_managed_aliases SET active = FALSE WHERE LOWER(address) = LOWER($1)',
    [address],
  );
  return true;
}
