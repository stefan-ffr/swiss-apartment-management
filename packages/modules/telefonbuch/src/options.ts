import { z } from 'zod';

export const TelefonbuchOptionsSchema = z.object({
  /** Prefix used in UIDs and stable identifiers (default: tenant id) */
  uidPrefix: z.string().min(1).default('sam'),

  /** vCard CATEGORIES value */
  category: z.string().min(1).default('Phonebook'),

  /** Regex patterns for "internal" email addresses that should NOT be
   *  exported to the phonebook (e.g. printer-tag emails). */
  internalEmailPatterns: z.array(z.string()).default([]),

  /** Optional CardDAV target. If omitted the sync is disabled. */
  carddav: z
    .object({
      /** Internal/private URL (preferred, bypasses egress IPs) */
      url: z.string().url(),
      /** Public URL — used only for the Host header, to satisfy
       *  Nextcloud `trusted_domains` while connecting via internal DNS */
      publicUrl: z.string().url().optional(),
      username: z.string().min(1),
      /** Env var name holding the app password (never the value itself) */
      passwordEnv: z.string().min(1),
      /** Addressbook slug under /remote.php/dav/addressbooks/users/<user>/ */
      addressbook: z.string().min(1).default('phonebook'),
      /** Displayname when the addressbook is auto-created via MKCOL */
      displayName: z.string().default('Phonebook'),
      description: z.string().default('Auto-synced phonebook'),
    })
    .optional(),

  /** Sync interval in milliseconds (default: 1 hour) */
  syncIntervalMs: z.number().int().positive().default(60 * 60 * 1000),
});

export type TelefonbuchOptions = z.infer<typeof TelefonbuchOptionsSchema>;
