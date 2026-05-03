import { z } from 'zod';

export const EnergieOptionsSchema = z.object({
  /** Permission key for read endpoints */
  readPermissionKey: z.string().default('energie'),

  /** Shared-secret header name + value for the ingest endpoint.
   *  External collectors (ioBroker etc.) authenticate via this. */
  ingestHeaderName: z.string().default('x-sam-ingest-key'),
  ingestSecretEnv: z.string().min(1).default('SAM_ENERGIE_INGEST_KEY'),

  /** Default unit when a meter is created without one */
  defaultUnit: z.string().default('kWh'),

  /** Maximum number of readings returned in one request */
  maxRange: z.number().int().positive().default(10000),
});

export type EnergieOptions = z.infer<typeof EnergieOptionsSchema>;
