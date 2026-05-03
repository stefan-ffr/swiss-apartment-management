import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION_TABLE = 'sam_migrations';

export async function ensureMigrationTable(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      module     TEXT NOT NULL,
      filename   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (module, filename)
    )
  `);
}

/**
 * Apply pending SQL migrations from `dir` for `moduleName`.
 *
 * Files must be named `NNN-description.sql` and are applied in
 * lexical order. Each file runs in a transaction.
 */
export async function runMigrations(db: Pool, moduleName: string, dir: string): Promise<void> {
  await ensureMigrationTable(db);
  const absDir = resolve(dir);
  const files = (await readdir(absDir))
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await db.query<{ filename: string }>(
    `SELECT filename FROM ${MIGRATION_TABLE} WHERE module = $1`,
    [moduleName],
  );
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  for (const f of files) {
    if (appliedSet.has(f)) continue;
    const sql = await readFile(join(absDir, f), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATION_TABLE} (module, filename) VALUES ($1, $2)`,
        [moduleName, f],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${moduleName}/${f} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
