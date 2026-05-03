import type { ModuleContext } from '@sam/core';
import { davRequest } from './dav.js';
import { buildVCard, type ContactInput } from './vcard.js';
import type { TelefonbuchOptions } from './options.js';

interface DbRow {
  name: string;
  email: string | null;
  telefon: string | null;
  wohnungen: { stweg: number; bezeichnung: string; rolle: string | null }[] | null;
}

export async function syncContactsToCardDav(
  ctx: ModuleContext,
  opts: TelefonbuchOptions,
): Promise<void> {
  const cd = opts.carddav;
  if (!cd) {
    ctx.logger.debug('[CardDAVSync] no carddav target configured, skipping');
    return;
  }
  const password = process.env[cd.passwordEnv];
  if (!password) {
    ctx.logger.warn(`[CardDAVSync] env ${cd.passwordEnv} is empty, skipping`);
    return;
  }

  const auth = 'Basic ' + Buffer.from(`${cd.username}:${password}`).toString('base64');
  const baseDav = `${cd.url.replace(/\/$/, '')}/remote.php/dav/addressbooks/users/${cd.username}/${cd.addressbook}`;
  const hostHeader = cd.publicUrl
    ? (() => {
        try {
          return new URL(cd.publicUrl).host;
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const withHost = (h: Record<string, string>): Record<string, string | undefined> =>
    hostHeader ? { ...h, Host: hostHeader } : h;

  // Idempotent MKCOL — 405 if it already exists.
  await davRequest(
    'MKCOL',
    baseDav,
    withHost({ Authorization: auth, 'Content-Type': 'application/xml' }),
    `<?xml version="1.0" encoding="utf-8"?>
<mkcol xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <set><prop>
    <resourcetype><collection/><c:addressbook/></resourcetype>
    <displayname>${cd.displayName}</displayname>
    <c:addressbook-description>${cd.description}</c:addressbook-description>
  </prop></set>
</mkcol>`,
  ).catch(() => undefined);

  const internalRx = opts.internalEmailPatterns.map((p) => new RegExp(p));
  const isInternalEmail = (e: string | null): boolean =>
    !!e && internalRx.some((rx) => rx.test(e));

  const { rows } = await ctx.db.query<DbRow>(`
    SELECT k.name, k.email, k.telefon,
           json_agg(json_build_object(
             'stweg',       w.stweg_nr,
             'bezeichnung', w.bezeichnung,
             'rolle',       k.rolle
           )) AS wohnungen
      FROM wohnungen_kontakte k
      JOIN wohnungen w ON w.id = k.wohnung_id
     WHERE k.name IS NOT NULL AND TRIM(k.name) <> ''
       AND k.archiviert_am IS NULL
     GROUP BY k.name, k.email, k.telefon
  `);

  const byName = new Map<string, ContactInput>();
  for (const r of rows) {
    const isDeceased = /\(verstorben\)/i.test(r.name);
    if (isDeceased) continue;
    const name = r.name.replace(/\s*\(verstorben\)\s*/i, '').trim();
    const internal = isInternalEmail(r.email);

    let entry = byName.get(name);
    if (!entry) {
      entry = { name, email: null, telefon: null, wohnungen: [] };
      byName.set(name, entry);
    }
    if (!internal && r.email && !entry.email) entry.email = r.email.trim();
    if (r.telefon && !entry.telefon) entry.telefon = r.telefon.trim();
    for (const w of r.wohnungen ?? []) {
      if (!entry.wohnungen.find((x) => x.stweg === w.stweg && x.bezeichnung === w.bezeichnung)) {
        entry.wohnungen.push(w);
      }
    }
  }
  const contacts = [...byName.values()].filter((c) => c.telefon || c.email);

  // Existing entries via PROPFIND
  const propfindRes = await davRequest(
    'PROPFIND',
    baseDav + '/',
    withHost({ Authorization: auth, Depth: '1', 'Content-Type': 'application/xml' }),
    `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getetag/></prop></propfind>`,
  );
  const existing = new Set<string>();
  for (const m of propfindRes.body.matchAll(/<d:href[^>]*>([^<]+)<\/d:href>/gi)) {
    const href = m[1];
    if (href && href.endsWith('.vcf')) {
      const file = decodeURIComponent(href.split('/').pop() ?? '');
      if (file) existing.add(file);
    }
  }

  let upserted = 0;
  const current = new Set<string>();
  for (const c of contacts) {
    const built = buildVCard(c, { uidPrefix: opts.uidPrefix, category: opts.category });
    current.add(built.filename);
    const r = await davRequest(
      'PUT',
      `${baseDav}/${built.filename}`,
      withHost({ Authorization: auth, 'Content-Type': 'text/vcard; charset=utf-8' }),
      built.vcard,
    );
    if (r.status === 200 || r.status === 201 || r.status === 204) upserted++;
    else ctx.logger.warn(`[CardDAVSync] PUT ${built.uid} -> ${r.status}`);
  }

  let deleted = 0;
  const ourPrefix = `${opts.uidPrefix}-`;
  for (const f of existing) {
    if (current.has(f)) continue;
    if (!f.startsWith(ourPrefix)) continue;
    const r = await davRequest('DELETE', `${baseDav}/${f}`, withHost({ Authorization: auth }));
    if (r.status === 200 || r.status === 204) deleted++;
  }
  ctx.logger.info(`[CardDAVSync] ${upserted} synced, ${deleted} removed (${contacts.length} total)`);
}
