import { createHash } from 'node:crypto';

export interface ContactInput {
  name: string;
  email: string | null;
  telefon: string | null;
  wohnungen: { stweg: number; bezeichnung: string; rolle: string | null }[];
}

export interface VCardOutput {
  uid: string;
  filename: string;
  vcard: string;
}

const escapeVcard = (s: string | null | undefined): string =>
  String(s ?? '').replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');

export function buildVCard(c: ContactInput, opts: { uidPrefix: string; category: string }): VCardOutput {
  const trimmed = c.name.trim();
  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  const first = tokens.slice(0, -1).join(' ');
  const note = c.wohnungen
    .map((w) => `STWEG ${w.stweg} ${w.bezeichnung} (${w.rolle ?? ''})`)
    .join('; ');

  const uid =
    `${opts.uidPrefix}-` +
    createHash('sha1').update(c.name.toLowerCase()).digest('hex').slice(0, 16);

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${escapeVcard(c.name)}`,
    `N:${escapeVcard(last)};${escapeVcard(first)};;;`,
  ];
  if (c.telefon) lines.push(`TEL;TYPE=CELL:${escapeVcard(c.telefon)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(c.email)}`);
  if (note) lines.push(`NOTE:${escapeVcard(note)}`);
  lines.push(`CATEGORIES:${escapeVcard(opts.category)}`);
  lines.push('END:VCARD');

  return {
    uid,
    filename: `${uid}.vcf`,
    vcard: lines.join('\r\n') + '\r\n',
  };
}
