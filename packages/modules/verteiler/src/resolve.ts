import type { VerteilerRow } from './types.js';
import type { VerteilerOptions } from './options.js';
import { requireResolver } from './services.js';

/**
 * Translate a verteiler row into a deduplicated list of recipient
 * email addresses, applying the tenant-configured blocklist.
 */
export async function resolveRecipients(
  v: VerteilerRow,
  opts: VerteilerOptions,
): Promise<string[]> {
  const blocklist = opts.recipientBlocklistPatterns.map((p) => new RegExp(p));
  const isBlocked = (e: string): boolean => blocklist.some((rx) => rx.test(e));

  const all = new Set<string>();

  if (v.group_names.length > 0) {
    const resolver = requireResolver();
    for (const gn of v.group_names) {
      const emails = await resolver(gn);
      for (const e of emails) {
        const ne = e.trim().toLowerCase();
        if (ne && !isBlocked(ne)) all.add(ne);
      }
    }
  }

  // Static fallback / additions
  for (const m of v.members) {
    const e = (typeof m === 'string' ? m : m.email)?.trim().toLowerCase();
    if (!e) continue;
    if (e.endsWith('.invalid')) continue;
    if (isBlocked(e)) continue;
    all.add(e);
  }

  return [...all];
}
