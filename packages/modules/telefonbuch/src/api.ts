import type { Express } from 'express';
import type { ModuleContext } from '@sam/core';
import { getLocale } from '@sam/core';
import type { TelefonbuchOptions } from './options.js';

interface DbRow {
  name: string;
  email: string | null;
  telefon: string | null;
  rolle: string | null;
  wohnung_id: number;
  stweg: number;
  bezeichnung: string;
  typ: string | null;
}

interface ContactEntry {
  name: string;
  deceased: boolean;
  email: string | null;
  telefon: string | null;
  rollen: string[];
  wohnungen: {
    wohnung_id: number;
    stweg: number;
    bezeichnung: string;
    typ: string | null;
    rolle: string | null;
  }[];
}

export function registerTelefonbuchApi(
  app: Express,
  ctx: ModuleContext,
  opts: TelefonbuchOptions,
): void {
  const internalRx = opts.internalEmailPatterns.map((p) => new RegExp(p));
  const isInternalEmail = (email: string): boolean =>
    internalRx.some((rx) => rx.test(email));

  const { authenticated } = ctx.middleware;
  app.get('/api/telefonbuch', authenticated, async (req, res) => {
    try {
      const { rows } = await ctx.db.query<DbRow>(`
        SELECT k.name, k.email, k.telefon, k.rolle,
               w.id AS wohnung_id, w.stweg_nr AS stweg, w.bezeichnung, w.typ
          FROM wohnungen_kontakte k
          JOIN wohnungen w ON w.id = k.wohnung_id
         WHERE k.name IS NOT NULL AND TRIM(k.name) <> ''
           AND k.archiviert_am IS NULL
         ORDER BY k.name
      `);

      const byName = new Map<string, ContactEntry>();
      const rollenSets = new Map<string, Set<string>>();

      for (const r of rows) {
        const isDeceased = /\(verstorben\)/i.test(r.name);
        const cleanName = r.name.replace(/\s*\(verstorben\)\s*/i, '').trim();
        const isInternal = r.email ? isInternalEmail(r.email) : false;

        let entry = byName.get(cleanName);
        if (!entry) {
          entry = {
            name: cleanName,
            deceased: isDeceased,
            email: null,
            telefon: null,
            rollen: [],
            wohnungen: [],
          };
          byName.set(cleanName, entry);
          rollenSets.set(cleanName, new Set());
        }
        if (!isInternal && r.email && !entry.email) entry.email = r.email.trim();
        if (r.telefon && !entry.telefon) entry.telefon = r.telefon.trim();
        if (r.rolle) rollenSets.get(cleanName)!.add(r.rolle);
        entry.wohnungen.push({
          wohnung_id: r.wohnung_id,
          stweg: r.stweg,
          bezeichnung: r.bezeichnung,
          typ: r.typ,
          rolle: r.rolle,
        });
        if (isDeceased) entry.deceased = true;
      }

      for (const [name, entry] of byName) {
        entry.rollen = [...(rollenSets.get(name) ?? [])];
      }

      const lastName = (n: string): string => (n.trim().split(/\s+/).pop() ?? '');
      const list = [...byName.values()].sort((a, b) => {
        const c = lastName(a.name).localeCompare(lastName(b.name), 'de');
        return c !== 0 ? c : a.name.localeCompare(b.name, 'de');
      });

      res.json({ contacts: list, count: list.length });
    } catch (err) {
      ctx.logger.error('[telefonbuch] api error', { err: (err as Error).message });
      res.status(500).json({ error: ctx.translator.t('errors.internal', getLocale(req)) });
    }
  });
}
