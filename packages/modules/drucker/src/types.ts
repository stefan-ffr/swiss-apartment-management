export type PrintJobStatus = 'printed' | 'picked_up' | 'cancelled';

export interface PrintJobRow {
  id: number;
  token: string;
  printer: string;
  recipient_name: string | null;
  recipient_address: string | null;
  recipient_wohnung: string | null;
  recipient_stweg: number | null;
  sender_email: string | null;
  subject: string | null;
  documents: number;
  message_id: string | null;
  status: PrintJobStatus;
  picked_up_at: Date | null;
  picked_up_by: string | null;
  last_reminder_at: Date | null;
  created_at: Date;
}

export interface PrintJobInput {
  token: string;
  printer: string;
  recipient_name?: string | null;
  recipient_address?: string | null;
  recipient_wohnung?: string | null;
  recipient_stweg?: number | null;
  sender_email?: string | null;
  subject?: string | null;
  documents?: number;
  message_id?: string | null;
}

/**
 * Build a deterministic drucker-tag email for a person.
 * Hosts can override this via {@link DruckerOptions.tagBuilder}.
 */
export type TagBuilder = (input: { name: string; printer: string; domain: string }) => string;
