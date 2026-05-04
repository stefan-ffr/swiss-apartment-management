/**
 * Thin client for the SMTP2GO Activity API.
 * Reference: https://apidoc.smtp2go.com/documentation/
 *
 * We use it for:
 *   - bounces / suppressions sync (cron),
 *   - on-demand delivery-status lookups by message-id.
 */
import type { Smtp2goOptions } from './options.js';

export interface SuppressionEntry {
  email: string;
  reason: string | null;
  detected: string;
}

export class Smtp2goError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`SMTP2GO API ${status}: ${body.slice(0, 200)}`);
  }
}

export class Smtp2goActivityClient {
  constructor(private readonly opts: Smtp2goOptions) {
    if (!opts.activityApi) {
      throw new Error('[smtp2go] options.activityApi is required for the activity client');
    }
  }

  private apiKey(): string {
    const env = this.opts.activityApi!.apiKeyEnv;
    const k = process.env[env];
    if (!k) throw new Error(`[smtp2go] env ${env} not set`);
    return k;
  }

  private async req<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.opts.activityApi!.baseUrl.replace(/\/$/, '')}${path}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey(), ...body }),
    });
    const text = await r.text();
    if (!r.ok) throw new Smtp2goError(r.status, text);
    return JSON.parse(text) as T;
  }

  /** Pull suppression list (recent bounces / spam-marks). */
  async listSuppressions(opts: { limit?: number } = {}): Promise<SuppressionEntry[]> {
    const r = await this.req<{ data?: { suppressions?: SuppressionEntry[] } }>(
      '/bounces/search',
      { limit: opts.limit ?? 1000 },
    );
    return r.data?.suppressions ?? [];
  }
}
