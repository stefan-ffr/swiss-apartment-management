import { z } from 'zod';

export const UnterschriftenlistenOptionsSchema = z.object({
  /** Permission key required for write endpoints */
  permissionKey: z.string().default('unterschriftenlisten'),

  /** Filesystem root under which `pdf_path` values resolve.
   *  Hosts that don't store PDFs can leave this unset and only
   *  serve the snapshot_data via the JSON verification endpoint. */
  pdfRoot: z.string().optional(),

  /** Public URL prefix for the verification page (printed on letters
   *  / used in QR codes / hash footer text). */
  verificationPageUrl: z.string().url().optional(),
});

export type UnterschriftenlistenOptions = z.infer<typeof UnterschriftenlistenOptionsSchema>;
