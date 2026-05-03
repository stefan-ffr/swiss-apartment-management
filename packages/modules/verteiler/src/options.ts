import { z } from 'zod';

export const VerteilerOptionsSchema = z.object({
  /** Permission key required for /api/verteiler/send (admin-equivalent) */
  permissionKey: z.string().default('verteiler'),

  /** Domain part used for tenant-owned distribution addresses (e.g. "lists.example.ch").
   *  Senders FROM a different domain are never auto-forwarded. */
  domain: z.string().min(1),

  /** Default From-address for sends (e.g. "noreply@example.ch") */
  fromAddress: z.string().email(),

  /** Per-user rate limit window in ms (default 10 min) */
  rateLimitWindowMs: z.number().int().positive().default(10 * 60 * 1000),

  /** Max sends per user inside the window (default 10) */
  rateLimitMax: z.number().int().positive().default(10),

  /** Email-address patterns to drop before resolution (anti-loop / printer-tags / ...).
   *  Each pattern is a JS regex source. */
  recipientBlocklistPatterns: z.array(z.string()).default([]),

  /** Loop-detection: subject prefixes that should never be redistributed */
  loopSubjectPrefixes: z.array(z.string()).default(['Zustellbericht:', 'Auto-Reply:']),

  /** Loop-detection: header names whose presence kills redistribution */
  loopHeaderNames: z.array(z.string()).default(['x-forwarded-by-sam']),

  /** Header value tagged on outbound emails so loops can be detected */
  loopHeaderValue: z.string().default('sam-verteiler'),
});

export type VerteilerOptions = z.infer<typeof VerteilerOptionsSchema>;
