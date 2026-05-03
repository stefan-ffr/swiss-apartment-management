export interface VerteilerRow {
  id: number;
  name: string;
  email_address: string;
  stweg_nr: number | null;
  description: string | null;
  group_names: string[];
  members: (string | { email: string; name?: string })[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface VerteilerInput {
  name?: string;
  email_address?: string;
  stweg_nr?: number | null;
  description?: string | null;
  group_names?: string[];
  members?: (string | { email: string; name?: string })[];
  active?: boolean;
}

export interface EmailLogRow {
  id: number;
  trigger: string | null;
  verteiler_id: number | null;
  from_email: string | null;
  from_name: string | null;
  to_addresses: string | null;
  subject: string | null;
  recipients_count: number;
  recipients_list: unknown;
  failed_recipients: unknown;
  has_attachments: boolean;
  status: 'sent' | 'partial' | 'failed';
  message_id: string | null;
  error_message: string | null;
  created_at: Date;
}

/** Caller-supplied resolver: groupName -> list of email addresses. */
export type GroupResolver = (groupName: string) => Promise<string[]>;

export interface SendMailOptions {
  from?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendMailResult {
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
}

/** Caller-supplied mailer. The module never imports a specific SMTP lib. */
export type Mailer = (opts: SendMailOptions) => Promise<SendMailResult>;
