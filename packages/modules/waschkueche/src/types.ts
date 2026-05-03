export interface RoomRow {
  id: number;
  name: string;
  location: string | null;
  stweg_nr: number | null;
  energy_meter_id: string | null;
  door_id: string | null;
  active: boolean;
  created_at: Date;
}

export interface ReservationRow {
  id: number;
  user_sub: string;
  room_id: number;
  start_time: Date;
  end_time: Date;
  recurring: boolean;
  recurring_until: string | null;
  cancelled: boolean;
  created_at: Date;
}

export interface SessionRow {
  id: number;
  user_sub: string;
  room_id: number;
  reservation_id: number | null;
  status: 'active' | 'finished' | 'cancelled';
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number | null;
  energy_start_kwh: string | null;
  energy_end_kwh: string | null;
  energy_consumed: string | null;
  cost: string | null;
}

export interface ReservationInput {
  room_id: number;
  start_time: string;
  end_time: string;
  recurring?: boolean;
  recurring_until?: string | null;
}
