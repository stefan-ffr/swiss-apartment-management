/**
 * Thin Mailcow API client. Uses fetch (Node ≥ 18 native) — Mailcow
 * accepts JSON well, no quirks comparable to Sabre/DAV here.
 *
 * Reference: <mailcow-host>/api  (Swagger UI shipped with Mailcow).
 */
import type { MailcowOptions } from './options.js';

export interface MailcowMailbox {
  username: string;
  domain: string;
  active: number | boolean;
  quota: number;
  name: string;
  attributes?: Record<string, unknown>;
}

export interface MailcowAlias {
  address: string;
  goto: string;
  active: number | boolean;
}

export interface AddMailboxInput {
  local_part: string;
  domain: string;
  name?: string;
  password: string;
  password2: string;
  quota?: number;
  active?: 0 | 1;
}

export interface AddAliasInput {
  address: string;
  goto: string;
  active?: 0 | 1;
}

export class MailcowError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Mailcow API ${status}: ${body.slice(0, 200)}`);
  }
}

export class MailcowClient {
  constructor(private readonly opts: MailcowOptions) {}

  private apiKey(): string {
    const k = process.env[this.opts.apiKeyEnv];
    if (!k) throw new Error(`Mailcow API key env ${this.opts.apiKeyEnv} not set`);
    return k;
  }

  private async req<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.opts.apiUrl.replace(/\/$/, '')}${path}`;
    const r = await fetch(url, {
      method,
      headers: {
        'X-API-Key': this.apiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) throw new MailcowError(r.status, text);
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new MailcowError(r.status, text);
    }
  }

  // ── Mailboxes ────────────────────────────────────────────────
  async listMailboxes(): Promise<MailcowMailbox[]> {
    return this.req<MailcowMailbox[]>('GET', '/api/v1/get/mailbox/all');
  }

  async getMailbox(address: string): Promise<MailcowMailbox | null> {
    try {
      const r = await this.req<MailcowMailbox | MailcowMailbox[]>(
        'GET',
        `/api/v1/get/mailbox/${encodeURIComponent(address)}`,
      );
      if (Array.isArray(r)) return r[0] ?? null;
      return r ?? null;
    } catch (e) {
      if (e instanceof MailcowError && e.status === 404) return null;
      throw e;
    }
  }

  async addMailbox(input: AddMailboxInput): Promise<unknown> {
    return this.req('POST', '/api/v1/add/mailbox', {
      local_part: input.local_part,
      domain: input.domain,
      name: input.name ?? input.local_part,
      password: input.password,
      password2: input.password2,
      quota: input.quota ?? 1024,
      active: input.active ?? 1,
    });
  }

  async setMailboxActive(address: string, active: boolean): Promise<unknown> {
    return this.req('POST', '/api/v1/edit/mailbox', {
      items: [address],
      attr: { active: active ? 1 : 0 },
    });
  }

  async setMailboxPassword(address: string, password: string): Promise<unknown> {
    return this.req('POST', '/api/v1/edit/mailbox', {
      items: [address],
      attr: { password, password2: password },
    });
  }

  async deleteMailbox(address: string): Promise<unknown> {
    return this.req('POST', '/api/v1/delete/mailbox', [address]);
  }

  // ── Aliases ──────────────────────────────────────────────────
  async listAliases(): Promise<MailcowAlias[]> {
    return this.req<MailcowAlias[]>('GET', '/api/v1/get/alias/all');
  }

  async addAlias(input: AddAliasInput): Promise<unknown> {
    return this.req('POST', '/api/v1/add/alias', {
      address: input.address,
      goto: input.goto,
      active: input.active ?? 1,
    });
  }

  async deleteAlias(addresses: string[]): Promise<unknown> {
    return this.req('POST', '/api/v1/delete/alias', addresses);
  }
}
