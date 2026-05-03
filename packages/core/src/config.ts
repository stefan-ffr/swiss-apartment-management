import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { TenantConfig } from './types.js';

const StwegSchema = z.object({
  nr: z.number().int().positive(),
  name: z.string().min(1),
  addresses: z.array(z.string()).default([]),
  groups: z.object({
    bewohner: z.string().optional(),
    eigentuemer: z.string().optional(),
    ausschuss: z.string().optional(),
  }),
  type: z.enum(['wohnung', 'tiefgarage', 'sonstiges']),
});

const ModuleEntrySchema = z.object({
  enabled: z.boolean().default(false),
  options: z.record(z.unknown()).optional(),
});

const TenantConfigSchema = z.object({
  $schema: z.string().optional(),
  tenant: z.object({
    id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'tenant.id must be slug-style'),
    name: z.string().min(1),
    domain: z.string().min(1),
    locale: z.string().default('de-CH'),
    timezone: z.string().default('Europe/Zurich'),
  }),
  stwegen: z.array(StwegSchema).default([]),
  auth: z.object({
    provider: z.enum(['authentik', 'oidc']),
    issuerUrl: z.string().url(),
    externalUrl: z.string().url(),
    internalUrl: z.string().url().optional(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    adminGroups: z.array(z.string()).default([]),
  }),
  database: z.object({
    host: z.string().min(1),
    port: z.number().int().default(5432),
    name: z.string().min(1),
    user: z.string().min(1),
    passwordEnv: z.string().min(1),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int(),
    user: z.string(),
    passwordEnv: z.string(),
    from: z.string(),
  }).optional(),
  storage: z.object({
    type: z.enum(['local', 'cifs', 's3']),
    path: z.string().optional(),
  }).passthrough(),
  modules: z.record(ModuleEntrySchema).default({}),
  branding: z.object({
    logoPath: z.string().optional(),
    primaryColor: z.string().optional(),
    favicon: z.string().optional(),
  }).optional(),
});

export class ConfigError extends Error {}

export async function loadTenantConfig(path?: string): Promise<TenantConfig> {
  const file = path ?? process.env.TENANT_CONFIG ?? resolve(process.cwd(), 'tenant.config.json');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    throw new ConfigError(`Cannot read tenant config at ${file}: ${(err as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Invalid JSON in ${file}: ${(err as Error).message}`);
  }
  const parsed = TenantConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid tenant config:\n${parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  // Strip $schema; cast types satisfy Zod's loose .passthrough()
  const { $schema: _ignored, ...rest } = parsed.data;
  return rest as TenantConfig;
}
