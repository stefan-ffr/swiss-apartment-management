export type Vote = 'ja' | 'nein' | 'enthaltung';

export interface SnapshotRow {
  hash: string;
  stweg_nr: number;
  datum: string;
  anlass_titel: string;
  snapshot_data: unknown;
  pdf_path: string | null;
  generated_by: string | null;
  download_count: number;
  generated_at: Date;
}

export interface RuecklaufRow {
  id: number;
  snapshot_hash: string;
  brief_idx: number;
  brief_typ: string;
  einheit: string | null;
  empfaenger_name: string | null;
  empfaenger_adresse: string | null;
  retourniert_am: Date | null;
  vote: Vote | null;
  notiz: string | null;
  erfasst_von: string | null;
  updated_at: Date;
  created_at: Date;
}

export interface SnapshotInput {
  hash: string;
  stweg_nr: number;
  datum: string;
  anlass_titel: string;
  snapshot_data: unknown;
  pdf_path?: string | null;
  generated_by?: string | null;
  /** When provided, the matching brief_idx rows are seeded so the
   *  Rücklauf-checklist is populated. */
  briefe?: {
    brief_idx: number;
    brief_typ?: string;
    einheit?: string | null;
    empfaenger_name?: string | null;
    empfaenger_adresse?: string | null;
  }[];
}

export interface RuecklaufUpdate {
  retourniert_am?: string | null;
  vote?: Vote | null;
  notiz?: string | null;
}
