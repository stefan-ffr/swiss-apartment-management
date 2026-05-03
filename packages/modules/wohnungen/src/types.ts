/**
 * Domain types. These match the SQL columns in `001-init.sql`.
 *
 * The DB layer returns rows shaped exactly like these interfaces;
 * route handlers may add `kontakte` to a `Wohnung` before responding.
 */

export type Rolle = 'eigentuemer' | 'mieter' | 'verwalter' | 'bewohner' | 'sonstige';

export const VALID_ROLLEN: readonly Rolle[] = [
  'eigentuemer',
  'mieter',
  'verwalter',
  'bewohner',
  'sonstige',
] as const;

export type BewohntVon = 'eigentuemer' | 'mieter' | 'leer';

export interface WohnungRow {
  id: number;
  stweg_nr: number;
  bezeichnung: string;
  stockwerk: string | null;
  zimmer: string | null;       // numeric -> string from pg
  flaeche_m2: string | null;
  typ: string;
  besonderheiten: string | null;
  bewohnt_von: BewohntVon;
  waschkueche_berechtigt: boolean;
  notizen: string | null;
  wertquote_zaehler: number | null;
  wertquote_nenner: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface KontaktRow {
  id: number;
  wohnung_id: number;
  rolle: Rolle;
  name: string | null;
  email: string | null;
  telefon: string | null;
  adresse: string | null;
  sort_order: number | null;
  authentik_zugang: boolean | null;
  gueltig_ab: string | null;     // ISO date
  archiviert_am: string | null;  // ISO date
  created_at: Date;
}

export interface KontaktInput {
  id?: number;
  rolle?: Rolle | string;
  name?: string | null;
  email?: string | null;
  telefon?: string | null;
  adresse?: string | null;
  authentik_zugang?: boolean | null;
  gueltig_ab?: string | null;
}

export interface WohnungWithKontakte extends WohnungRow {
  kontakte: KontaktRow[];
}
