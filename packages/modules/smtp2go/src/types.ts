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

export interface InboundMessage {
  messageId: string;
  recipient: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  headers: Record<string, string | string[]>;
  text?: string;
  html?: string;
}

export type InboundHandler = (msg: InboundMessage) => Promise<void>;

export interface SuppressionRow {
  address: string;
  reason: string | null;
  detected_at: Date;
  last_synced: Date;
}
