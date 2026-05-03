import type { DruckerOptions } from './options.js';

/**
 * Build a deterministic drucker-tag for a person.
 *
 *   "Hans Müller"  →  "drucker+mueller.hans@<domain>"
 *
 * The slug is reverse-name (lastname first) so collisions stay
 * stable across invocations and the prefix can be filtered cheaply.
 */
export function buildDruckerTag(name: string, opts: DruckerOptions): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .split(/\s+/)
    .reverse()
    .join('.');
  return `${opts.tagPrefix}+${slug}@${opts.domain}`;
}

/** Quick test: does this look like a tagged drucker alias of ours? */
export function isDruckerTag(addr: string, opts: DruckerOptions): boolean {
  const at = addr.indexOf('@');
  if (at === -1) return false;
  const domain = addr.slice(at + 1).toLowerCase();
  if (domain !== opts.domain.toLowerCase()) return false;
  return addr.toLowerCase().startsWith(`${opts.tagPrefix}+`);
}

/** Quick test: bare alias (no +tag) — never deliverable. */
export function isBareDruckerAddr(addr: string, opts: DruckerOptions): boolean {
  return addr.toLowerCase() === `${opts.tagPrefix}@${opts.domain}`;
}

/** Extract the slug back from a tagged alias, or null. */
export function extractSlug(addr: string, opts: DruckerOptions): string | null {
  if (!isDruckerTag(addr, opts)) return null;
  const at = addr.indexOf('@');
  return addr.slice(`${opts.tagPrefix}+`.length, at);
}
