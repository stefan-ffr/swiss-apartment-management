import type { Express, Request } from 'express';
import type { ModuleContext } from '@sam/core';
import { getLocale } from '@sam/core';
import type { MailcowOptions } from './options.js';
import { MailcowClient, MailcowError } from './client.js';
import {
  provisionMailbox,
  deactivateMailbox,
  ensureAlias,
  deleteAlias,
  type ProvisionMailboxInput,
} from './sync.js';
import { syncVerteilerAliases, syncDruckerAliases } from './bridges/index.js';
import { VerteilerOptionsSchema } from '@sam/module-verteiler';
import { DruckerOptionsSchema } from '@sam/module-drucker';

export function registerMailcowApi(
  app: Express,
  ctx: ModuleContext,
  opts: MailcowOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const adminRead = requirePermission(opts.permissionKey, 'read');
  const adminWrite = requirePermission(opts.permissionKey, 'write');
  const t = (req: Request, key: string, params?: Record<string, unknown>): string =>
    ctx.translator.t(key, getLocale(req), params);

  // ── Health / connectivity check ────────────────────────────────
  app.get('/api/mailcow/health', authenticated, adminRead, async (req, res) => {
    try {
      const client = new MailcowClient(opts);
      // Cheap call: list mailboxes (returns empty array if none)
      await client.listMailboxes();
      res.json({ ok: true });
    } catch (err) {
      const e = err as MailcowError;
      res.status(502).json({ ok: false, error: e.message, status: e.status ?? 0 });
    }
  });

  // ── Mailbox listing (passthrough; admin only because PII) ──────
  app.get('/api/mailcow/mailboxes', authenticated, adminRead, async (req, res) => {
    try {
      const client = new MailcowClient(opts);
      const remote = await client.listMailboxes();
      const managed = await ctx.db.query<{ address: string }>(
        'SELECT address FROM mailcow_managed_mailboxes',
      );
      const managedSet = new Set(managed.rows.map((r) => r.address.toLowerCase()));
      res.json({
        mailboxes: remote.map((m) => {
          const address = `${m.username}`;
          return { ...m, sam_managed: managedSet.has(address.toLowerCase()) };
        }),
      });
    } catch (err) {
      ctx.logger.error('[mailcow] list mailboxes failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  // ── Provision a mailbox ────────────────────────────────────────
  app.post('/api/mailcow/mailboxes', authenticated, adminWrite, async (req, res) => {
    const b = req.body as Partial<ProvisionMailboxInput>;
    if (!b.localPart || !b.name) {
      return res.status(400).json({ error: t(req, 'errors.localPartAndNameRequired') });
    }
    try {
      const r = await provisionMailbox(ctx, opts, {
        localPart: b.localPart,
        domain: b.domain,
        name: b.name,
        userSub: b.userSub,
        quotaMb: b.quotaMb,
        password: b.password,
      });
      res.status(r.created ? 201 : 200).json(r);
    } catch (err) {
      ctx.logger.error('[mailcow] provision failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  // ── Deactivate a mailbox we manage ─────────────────────────────
  app.post('/api/mailcow/mailboxes/:addr/deactivate', authenticated, adminOnly, async (req, res) => {
    try {
      const ok = await deactivateMailbox(ctx, opts, req.params.addr ?? '');
      if (!ok) return res.status(404).json({ error: t(req, 'errors.notSamManagedOrInactive') });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[mailcow] deactivate failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  // ── Aliases ────────────────────────────────────────────────────
  app.get('/api/mailcow/aliases', authenticated, adminRead, async (req, res) => {
    try {
      const client = new MailcowClient(opts);
      const remote = await client.listAliases();
      const managed = await ctx.db.query<{ address: string; purpose: string | null }>(
        'SELECT address, purpose FROM mailcow_managed_aliases',
      );
      const managedMap = new Map(managed.rows.map((r) => [r.address.toLowerCase(), r.purpose]));
      res.json({
        aliases: remote.map((a) => ({
          ...a,
          sam_managed: managedMap.has(a.address.toLowerCase()),
          sam_purpose: managedMap.get(a.address.toLowerCase()) ?? null,
        })),
      });
    } catch (err) {
      ctx.logger.error('[mailcow] list aliases failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  app.post('/api/mailcow/aliases', authenticated, adminWrite, async (req, res) => {
    const { address, goto, purpose } = (req.body ?? {}) as {
      address?: string;
      goto?: string;
      purpose?: string;
    };
    if (!address || !goto) return res.status(400).json({ error: t(req, 'errors.addressAndGotoRequired') });
    try {
      const r = await ensureAlias(ctx, opts, address, goto, purpose);
      res.status(r.created ? 201 : 200).json(r);
    } catch (err) {
      ctx.logger.error('[mailcow] add alias failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  app.delete('/api/mailcow/aliases/:addr', authenticated, adminOnly, async (req, res) => {
    try {
      const ok = await deleteAlias(ctx, opts, req.params.addr ?? '');
      if (!ok) return res.status(404).json({ error: t(req, 'errors.notSamManaged') });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[mailcow] delete alias failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  // ── Bridge: verteiler → Mailcow aliases (manual trigger) ──────
  app.post('/api/mailcow/bridges/verteiler/sync', authenticated, adminWrite, async (req, res) => {
    if (!opts.bridges.verteiler.enabled) {
      return res.status(409).json({ error: t(req, 'errors.verteilerBridgeDisabled') });
    }
    const verteilerEntry = ctx.config.modules.verteiler;
    if (!verteilerEntry?.enabled) {
      return res.status(409).json({ error: t(req, 'errors.verteilerModuleDisabled') });
    }
    const parsed = VerteilerOptionsSchema.safeParse(verteilerEntry.options ?? {});
    if (!parsed.success) {
      return res.status(409).json({ error: t(req, 'errors.verteilerOptionsInvalid') });
    }
    try {
      const stats = await syncVerteilerAliases(ctx, opts, {
        verteilerOptions: parsed.data,
        auditBcc: opts.bridges.verteiler.auditBcc,
        maxRecipientsPerAlias: opts.bridges.verteiler.maxRecipientsPerAlias,
      });
      res.json({ ok: true, ...stats });
    } catch (err) {
      ctx.logger.error('[mailcow] verteiler bridge failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });

  // ── Bridge: drucker → Mailcow aliases (manual trigger) ────────
  app.post('/api/mailcow/bridges/drucker/sync', authenticated, adminWrite, async (req, res) => {
    if (!opts.bridges.drucker.enabled) {
      return res.status(409).json({ error: t(req, 'errors.druckerBridgeDisabled') });
    }
    const ingest = opts.bridges.drucker.ingestAddress;
    if (!ingest) {
      return res.status(409).json({ error: t(req, 'errors.druckerIngestRequired') });
    }
    const druckerEntry = ctx.config.modules.drucker;
    if (!druckerEntry?.enabled) {
      return res.status(409).json({ error: t(req, 'errors.druckerModuleDisabled') });
    }
    const parsed = DruckerOptionsSchema.safeParse(druckerEntry.options ?? {});
    if (!parsed.success) {
      return res.status(409).json({ error: t(req, 'errors.druckerOptionsInvalid') });
    }
    try {
      const stats = await syncDruckerAliases(ctx, opts, {
        druckerOptions: parsed.data,
        ingestAddress: ingest,
      });
      res.json({ ok: true, ...stats });
    } catch (err) {
      ctx.logger.error('[mailcow] drucker bridge failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.internal') });
    }
  });
}
