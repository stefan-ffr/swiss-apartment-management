import { z } from 'zod';

export const DruckerOptionsSchema = z.object({
  /** Email tag prefix (e.g. "drucker") used for virtual aliases. */
  tagPrefix: z.string().default('drucker'),

  /** Domain part of the virtual alias (e.g. "print.example.ch"). */
  domain: z.string().min(1),

  /** Permission key required for admin endpoints */
  permissionKey: z.string().default('drucker'),

  /** Reminder cadence (ms) for un-picked-up jobs (default 24h) */
  reminderIntervalMs: z.number().int().positive().default(24 * 60 * 60 * 1000),

  /** Number of days to keep un-picked-up jobs (after which auto-cancel) */
  autoCancelAfterDays: z.number().int().positive().default(30),

  /** Public base URL used in pickup links (e.g. "https://stweg.example.ch") */
  publicBaseUrl: z.string().url().optional(),

  /** Printer aliases configured per location (label → identifier) */
  printers: z.record(z.string()).default({}),
});

export type DruckerOptions = z.infer<typeof DruckerOptionsSchema>;
