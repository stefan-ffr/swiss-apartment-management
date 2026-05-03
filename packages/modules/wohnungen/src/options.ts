import { z } from 'zod';

export const WohnungenOptionsSchema = z.object({
  /** Permission key used by routes (override if multiple instances coexist) */
  permissionKey: z.string().default('wohnungen'),

  /** Permission key required to view archived contacts */
  historyPermissionKey: z.string().default('wohnungen-historie'),

  /** Default value for a kontakt's `authentik_zugang` per role */
  defaultAuthentikZugangPerRolle: z
    .record(z.boolean().nullable())
    .default({
      eigentuemer: true,
      verwalter: true,
      mieter: null,
      bewohner: null,
      sonstige: null,
    }),
});

export type WohnungenOptions = z.infer<typeof WohnungenOptionsSchema>;
