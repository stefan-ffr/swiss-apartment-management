/**
 * SMTP submission adapter for SMTP2GO. Returns a function with the
 * Mailer signature that @sam/module-verteiler accepts via
 * setServices({ mailer }) — symmetric with createMailcowMailer.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { Smtp2goOptions } from './options.js';
import type { SendMailOptions, SendMailResult } from './types.js';

let cached: Transporter | null = null;

function buildTransporter(opts: Smtp2goOptions): Transporter {
  if (!opts.smtp) {
    throw new Error('[smtp2go] options.smtp is required to use the Mailer adapter');
  }
  const user = process.env[opts.smtp.userEnv];
  const pass = process.env[opts.smtp.passwordEnv];
  if (!user || !pass) {
    throw new Error(
      `[smtp2go] SMTP creds env not set: ${opts.smtp.userEnv}, ${opts.smtp.passwordEnv}`,
    );
  }
  return nodemailer.createTransport({
    host: opts.smtp.host,
    port: opts.smtp.port,
    secure: opts.smtp.secure,
    auth: { user, pass },
  });
}

export function createSmtp2goMailer(
  opts: Smtp2goOptions,
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
