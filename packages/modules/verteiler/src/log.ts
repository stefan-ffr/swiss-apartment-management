import type { Pool } from 'pg';

export interface EmailLogEntry {
  trigger: string;
  verteiler_id?: number | null;
  from_email?: string | null;
  from_name?: string | null;
  to_addresses?: string | null;
  subject?: string | null;
  recipients_count?: number;
  recipients_list?: unknown;
  failed_recipients?: unknown;
  has_attachments?: boolean;
  status: 'sent' | 'partial' | 'failed';
  message_id?: string | null;
  error_message?: string | null;
}

export async function logEmail(db: Pool, entry: EmailLogEntry): Promise<void> {
  await db.query(
    `INSERT INTO email_log
       (trigger, verteiler_id, from_email, from_name, to_addresses,
        subject, recipients_count, recipients_list, failed_recipients,
        has_attachments, status, message_id, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      entry.trigger,
      entry.verteiler_id ?? null,
      entry.from_email ?? null,
      entry.from_name ?? null,
      entry.to_addresses ?? null,
      entry.subject ?? null,
      entry.recipients_count ?? 0,
      entry.recipients_list ? JSON.stringify(entry.recipients_list) : null,
      entry.failed_recipients ? JSON.stringify(entry.failed_recipients) : null,
      entry.has_attachments ?? false,
      entry.status,
      entry.message_id ?? null,
      entry.error_message ?? null,
    ],
  );
}
