import { z } from 'zod';

export const VerwaltungOptionsSchema = z.object({
  /** Permission key for admin endpoints (read incl. credentials, write) */
  permissionKey: z.string().default('verwaltung'),

  /** When false, the public endpoint /api/verwaltungen/public is not registered */
  exposePublicEndpoint: z.boolean().default(true),
});

export type VerwaltungOptions = z.infer<typeof VerwaltungOptionsSchema>;
