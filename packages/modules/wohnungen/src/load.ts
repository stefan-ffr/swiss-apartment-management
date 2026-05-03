import type { Pool, PoolClient } from 'pg';
import type { KontaktRow, WohnungRow, WohnungWithKontakte } from './types.js';

type Db = Pool | PoolClient;

export interface LoadOptions {
  /** When true, return only archived rows (history view). Default false. */
  onlyHistory?: boolean;
}

/**
 * Load a single Wohnung with its kontakte.
 *
 * Default: returns active + scheduled (vorgemerkt) entries —
 * archived ones are excluded. With `onlyHistory: true`, only the
 * archived entries are returned (for the history view).
 */
export async function loadWohnungMitKontakte(
  db: Db,
  wohnungId: number,
  opts: LoadOptions = {},
): Promise<WohnungWithKontakte | null> {
  const wRes = await db.query<WohnungRow>('SELECT * FROM wohnungen WHERE id = $1', [wohnungId]);
  const w = wRes.rows[0];
  if (!w) return null;

  let kRes;
  if (opts.onlyHistory) {
    kRes = await db.query<KontaktRow>(
      `SELECT * FROM wohnungen_kontakte
        WHERE wohnung_id = $1 AND archiviert_am IS NOT NULL
        ORDER BY archiviert_am DESC, rolle, id`,
      [wohnungId],
    );
  } else {
    kRes = await db.query<KontaktRow>(
      `SELECT * FROM wohnungen_kontakte
        WHERE wohnung_id = $1 AND archiviert_am IS NULL
        ORDER BY rolle, sort_order, id`,
      [wohnungId],
    );
  }
  return { ...w, kontakte: kRes.rows };
}
