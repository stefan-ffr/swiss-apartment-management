import { z } from 'zod';

export const WaschkuecheOptionsSchema = z.object({
  /** Permission key required for the booking endpoints */
  permissionKey: z.string().default('waschkueche'),

  /** Maximum reservation duration in minutes */
  maxSlotMinutes: z.number().int().positive().default(240),

  /** Cost per kWh (CHF) — used when billing is enabled */
  costPerKwh: z.number().nonnegative().default(0.30),

  /** Maximum days in advance a reservation can be made */
  maxAdvanceDays: z.number().int().positive().default(28),

  /** When true, recurring reservations are accepted */
  allowRecurring: z.boolean().default(true),
});

export type WaschkuecheOptions = z.infer<typeof WaschkuecheOptionsSchema>;
