/**
 * Lightweight ICU-MessageFormat-based i18n layer.
 *
 * Each module ships its own `locales/<locale>.json` directory. The
 * registry loads it at startup and binds a `ScopedTranslator` to
 * `ModuleContext.translator`. Modules call `ctx.translator.t(key,
 * locale, params)` — they never need to know which file was loaded.
 *
 * Locale resolution chain:
 *   1. explicit locale arg (set by callers from req.locale)
 *   2. tenant.config.tenant.locale (sticky default for the deploy)
 *   3. 'en' (final fallback — every module MUST ship en.json)
 *
 * Format library: @formatjs/intl-messageformat (BSD-3-Clause).
 * Compiled IntlMessageFormat instances are cached per (locale, key)
 * because compilation is expensive vs. format().
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';

export type Locale = string; // RFC 5646 tag, e.g. "de-CH"
export type Messages = Record<string, string>;
export type LocaleBundle = Record<Locale, Messages>;

export interface Translator {
  /** Translate a fully-qualified key (`<namespace>.<key.path>`). */
  t(key: string, locale: Locale | undefined, params?: Record<string, unknown>): string;
  /** Locales this translator knows about. */
  availableLocales(): Locale[];
}

export interface ScopedTranslator extends Translator {
  /** The module namespace bound to this translator. */
  readonly namespace: string;
}

const FALLBACK: Locale = 'en';

/**
 * Flatten a nested JSON object into dotted keys: `{"a":{"b":"x"}}`
 * → `{"a.b":"x"}`. Ordinary string-only entries are kept as-is.
 */
function flatten(obj: unknown, prefix = ''): Messages {
  const out: Messages = {};
  if (typeof obj !== 'object' || obj === null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[full] = v;
    else if (typeof v === 'object' && v !== null) Object.assign(out, flatten(v, full));
  }
  return out;
}

export class IntlTranslator implements Translator {
  private readonly bundles = new Map<Locale, Messages>();
  private readonly cache = new Map<string, IntlMessageFormat>();
  private readonly tenantDefaultLocale: Locale;

  constructor(opts: { tenantDefaultLocale?: Locale } = {}) {
    this.tenantDefaultLocale = opts.tenantDefaultLocale ?? FALLBACK;
  }

  /** Merge a per-module locale bundle into the global store. */
  addBundle(namespace: string, bundle: LocaleBundle): void {
    for (const [locale, messages] of Object.entries(bundle)) {
      const existing = this.bundles.get(locale) ?? {};
      for (const [key, value] of Object.entries(messages)) {
        existing[`${namespace}.${key}`] = value;
      }
      this.bundles.set(locale, existing);
    }
  }

  availableLocales(): Locale[] {
    return [...this.bundles.keys()];
  }

  t(key: string, locale: Locale | undefined, params?: Record<string, unknown>): string {
    const requested = locale ?? this.tenantDefaultLocale;
    const message = this.lookup(key, requested);
    if (!message) {
      // Last-resort: return the key itself so devs immediately see
      // the missing-translation. Better than silent empty string.
      return key;
    }
    const cacheKey = `${requested}::${key}`;
    let fmt = this.cache.get(cacheKey);
    if (!fmt) {
      try {
        fmt = new IntlMessageFormat(message, requested);
        this.cache.set(cacheKey, fmt);
      } catch {
        // Malformed ICU pattern — fall back to raw string with naive
        // {placeholder} replacement so we never blow up at runtime.
        return params
          ? message.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
          : message;
      }
    }
    return String(fmt.format(params));
  }

  /** Resolve key with locale fallbacks (requested → tenant default → en). */
  private lookup(key: string, locale: Locale): string | undefined {
    const tryOrder: Locale[] = [];
    const seen = new Set<Locale>();
    const push = (l: Locale): void => {
      if (!seen.has(l)) {
        tryOrder.push(l);
        seen.add(l);
      }
    };
    push(locale);
    // Strip region: "de-CH" → also try "de"
    const region = locale.indexOf('-');
    if (region > 0) push(locale.slice(0, region));
    push(this.tenantDefaultLocale);
    push(FALLBACK);

    for (const l of tryOrder) {
      const bundle = this.bundles.get(l);
      const v = bundle?.[key];
      if (v !== undefined) return v;
    }
    return undefined;
  }

  scoped(namespace: string): ScopedTranslator {
    return new NamespacedTranslator(this, namespace);
  }
}

class NamespacedTranslator implements ScopedTranslator {
  constructor(private readonly parent: IntlTranslator, public readonly namespace: string) {}

  t(key: string, locale: Locale | undefined, params?: Record<string, unknown>): string {
    // Allow callers to bypass scoping with an explicit `common.` prefix
    // (or any other namespace they want — full keys always win).
    const fullKey = key.includes('.') && !key.startsWith(`${this.namespace}.`) && this.parent.hasNamespace(key)
      ? key
      : `${this.namespace}.${key}`;
    return this.parent.t(fullKey, locale, params);
  }

  availableLocales(): Locale[] {
    return this.parent.availableLocales();
  }
}

// Augment IntlTranslator with namespace-prefix lookup used by the scoped
// wrapper. Done as a method-like getter on the class without exposing
// internal state.
declare module './i18n.js' {
  interface IntlTranslator {
    hasNamespace(key: string): boolean;
  }
}
IntlTranslator.prototype.hasNamespace = function (key: string): boolean {
  const dot = key.indexOf('.');
  if (dot <= 0) return false;
  const ns = key.slice(0, dot);
  // A namespace exists iff at least one bundle has a key starting with it.
  for (const bundle of (this as unknown as { bundles: Map<Locale, Messages> }).bundles.values()) {
    for (const k of Object.keys(bundle)) if (k.startsWith(`${ns}.`)) return true;
  }
  return false;
};

/**
 * Load all `*.json` files from `dir` and return them as a
 * locale → flattened-messages map. The filename (without extension)
 * is the locale tag.
 */
export async function loadLocaleDir(dir: string): Promise<LocaleBundle> {
  const abs = resolve(dir);
  let files: string[];
  try {
    files = await readdir(abs);
  } catch {
    return {};
  }
  const out: LocaleBundle = {};
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const locale = f.replace(/\.json$/, '');
    try {
      const raw = await readFile(join(abs, f), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      out[locale] = flatten(parsed);
    } catch {
      // Skip unreadable / malformed files; the registry warns about
      // them in the calling layer where the logger is available.
    }
  }
  return out;
}

/**
 * Parse an `Accept-Language` header (RFC 7231) and return the best
 * match against the supported locales, or undefined.
 */
export function pickAcceptLanguage(
  header: string | undefined,
  supported: Locale[],
): Locale | undefined {
  if (!header) return undefined;
  const want = header
    .split(',')
    .map((p) => {
      const [tag, ...params] = p.trim().split(';');
      const q = params.find((x) => x.startsWith('q='));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: (tag ?? '').trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((x) => x.tag && x.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  const sup = new Map(supported.map((l) => [l.toLowerCase(), l]));
  for (const w of want) {
    const exact = sup.get(w.tag);
    if (exact) return exact;
    // Strip region: "de-de" → "de"
    const dash = w.tag.indexOf('-');
    if (dash > 0) {
      const base = w.tag.slice(0, dash);
      // Match any supported locale whose base matches: "de" → "de-CH"
      for (const [k, v] of sup) {
        if (k === base || k.startsWith(`${base}-`)) return v;
      }
    } else {
      for (const [k, v] of sup) {
        if (k === w.tag || k.startsWith(`${w.tag}-`)) return v;
      }
    }
  }
  return undefined;
}
