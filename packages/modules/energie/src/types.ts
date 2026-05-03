export type MeterType = 'electric' | 'water' | 'gas' | 'heat';

export interface MeterRow {
  id: string;
  label: string;
  unit: string;
  stweg_nr: number | null;
  wohnung_id: number | null;
  type: MeterType;
  tariff_id: string | null;
  cumulative: boolean;
  active: boolean;
  notes: string | null;
  created_at: Date;
}

export interface ReadingRow {
  id: number;
  meter_id: string;
  value: string;             // numeric -> string from pg
  timestamp: Date;
  source: string | null;
}

export interface TariffRow {
  id: string;
  label: string;
  unit: string;
  chf_per_unit: string;
  valid_from: string;
  valid_until: string | null;
  created_at: Date;
}

export interface ReadingInput {
  meter_id: string;
  value: number;
  timestamp?: string;
  source?: string;
}
