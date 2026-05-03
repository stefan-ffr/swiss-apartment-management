import type { PoolClient } from 'pg';
import type { KontaktInput, KontaktRow, Rolle } from './types.js';
import { VALID_ROLLEN } from './types.js';
import type { WohnungenOptions } from './options.js';

/**
 * Save kontakte for a wohnung while preserving history.
 *
 * Compared to a naive "delete + insert", this:
 *   - UPDATEs existing active rows when the input carries an `id`
 *     that matches an active row,
 *   - INSERTs new rows (with `gueltig_ab` from input) when no `id`
 *     is provided,
 *   - sets `archiviert_am = CURRENT_DATE` on rows that were active
 *     but are no longer in the input list (i.e. dropped from the
 *     UI). They are never hard-deleted.
 *
 * Already-archived rows are never touched.
 */
export async function saveKontakte(
  client: PoolClient,
  wohnungId: number,
  incoming: KontaktInput[] | undefined,
  opts: WohnungenOptions,
): Promise<void> {
  const items = Array.isArray(incoming) ? incoming : [];

  const oldActive = await client.query<KontaktRow>(
    'SELECT * FROM wohnungen_kontakte WHERE wohnung_id = $1 AND archiviert_am IS NULL',
    [wohnungId],
  );
  const incomingIds = new Set(
    items.map((k) => k.id).filter((id): id is number => typeof id === 'number'),
  );

  // Archive rows that the UI dropped from the list
  const removed = oldActive.rows.filter((r) => !incomingIds.has(r.id)).map((r) => r.id);
  if (removed.length > 0) {
    await client.query(
      `UPDATE wohnungen_kontakte
          SET archiviert_am = CURRENT_DATE
        WHERE id = ANY($1::int[]) AND archiviert_am IS NULL`,
      [removed],
    );
  }

  for (let i = 0; i < items.length; i++) {
    const k = items[i]!;
    if (!k.name && !k.email) continue;

    const rolle: Rolle = (VALID_ROLLEN as readonly string[]).includes(k.rolle ?? '')
      ? (k.rolle as Rolle)
      : 'eigentuemer';

    const defaultZugang = opts.defaultAuthentikZugangPerRolle[rolle] ?? null;
    const authentikZugang =
      k.authentik_zugang !== undefined ? k.authentik_zugang : defaultZugang;

    const existing = oldActive.rows.find((r) => r.id === k.id);
    if (existing) {
      await client.query(
        `UPDATE wohnungen_kontakte
            SET rolle = $1, name = $2, email = $3, telefon = $4, adresse = $5,
                sort_order = $6, authentik_zugang = $7,
                gueltig_ab = COALESCE($8::date, gueltig_ab)
          WHERE id = $9`,
        [
          rolle,
          k.name ?? null,
          k.email ?? null,
          k.telefon ?? null,
          k.adresse ?? null,
          i,
          authentikZugang,
          k.gueltig_ab ?? null,
          existing.id,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO wohnungen_kontakte
           (wohnung_id, rolle, name, email, telefon, adresse, sort_order, authentik_zugang, gueltig_ab)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date)`,
        [
          wohnungId,
          rolle,
          k.name ?? null,
          k.email ?? null,
          k.telefon ?? null,
          k.adresse ?? null,
          i,
          authentikZugang,
          k.gueltig_ab ?? null,
        ],
      );
    }
  }
}
