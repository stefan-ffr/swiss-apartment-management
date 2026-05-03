/**
 * SMTP submission adapter. Converts the host's nodemailer instance
 * into the `Mailer` shape that @sam/module-verteiler (and any other
 * caller) expects.
 *
 * The host wires this up:
 *
 *   import nodemailer from 'nodemailer';
 *   import { setServices } from '@sam/module-verteiler';
 *   import { createMailcowMailer } from '@sam/module-mailcow';
 *
 *   const mailer = createMailcowMailer(opts);
 *   setServices({ mailer, resolveGroup: ... });
 *
 * We don't import @sam/module-verteiler here on purpose — the
 * `Mailer` type is structurally compatible, so consumers that don't
 * use verteiler can still use this mailer.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { MailcowOptions } from './options.js';

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

let cached: Transporter | null = null;

function buildTransporter(opts: MailcowOptions): Transporter {
  if (!opts.smtp) {
    throw new Error('[mailcow] options.smtp is required to use the Mailer adapter');
  }
  const user = process.env[opts.smtp.userEnv];
  const pass = process.env[opts.smtp.passwordEnv];
  if (!user || !pass) {
    throw new Error(
      `[mailcow] SMTP creds env not set: ${opts.smtp.userEnv}, ${opts.smtp.passwordEnv}`,
    );
  }
  return nodemailer.createTransport({
    host: opts.smtp.host,
    port: opts.smtp.port,
    secure: opts.smtp.secure,
    auth: { user, pass },
  });
}

export function createMailcowMailer(
  opts: MailcowOptions,
): (m: SendMailOptions) => Promise<SendMailResult> {
  return async (m) => {
    if (!cached) cached = buildTransporter(opts);
    const r = await cached.sendMail({
      from: m.from ?? opts.smtp?.from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
    });
    return {
      messageId: r.messageId,
      accepted: r.accepted as string[] | undefined,
      rejected: r.rejected as string[] | undefined,
    };
  };
}
