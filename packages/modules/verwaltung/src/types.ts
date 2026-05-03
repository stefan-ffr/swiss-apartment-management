export interface VerwaltungRow {
  id: number;
  stweg_nr: number | null;
  firma_name: string;
  adresse: string | null;
  telefon: string | null;
  email: string | null;
  plattform_name: string | null;
  plattform_url: string | null;
  plattform_user: string | null;
  plattform_pass: string | null;
  vertrag_von: string | null;
  vertrag_bis: string | null;
  kuendigungsfrist_monate: number | null;
  kuendigung_eingereicht_am: string | null;
  dokument_pfad: string | null;
  notizen: string | null;
  aktiv: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface KontaktRow {
  id: number;
  verwaltung_id: number;
  name: string;
  funktion: string | null;
  email: string | null;
  telefon: string | null;
  sort_order: number;
  created_at: Date;
}

export interface VerwaltungWithKontakte extends VerwaltungRow {
  kontakte: KontaktRow[];
}

/** Public view: omits credentials, vertragsdaten, notizen, dokument_pfad */
export type VerwaltungPublic = Pick<
  VerwaltungRow,
  'id' | 'stweg_nr' | 'firma_name' | 'adresse' | 'telefon' | 'email' | 'plattform_name' | 'plattform_url'
> & { kontakte: Pick<KontaktRow, 'name' | 'funktion' | 'email' | 'telefon'>[] };

export interface VerwaltungInput {
  stweg_nr?: number | null;
  firma_name?: string;
  adresse?: string | null;
  telefon?: string | null;
  email?: string | null;
  plattform_name?: string | null;
  plattform_url?: string | null;
  plattform_user?: string | null;
  plattform_pass?: string | null;
  vertrag_von?: string | null;
  vertrag_bis?: string | null;
  kuendigungsfrist_monate?: number | null;
  kuendigung_eingereicht_am?: string | null;
  dokument_pfad?: string | null;
  notizen?: string | null;
  aktiv?: boolean;
}

export interface KontaktInput {
  name?: string;
  funktion?: string | null;
  email?: string | null;
  telefon?: string | null;
  sort_order?: number;
}
