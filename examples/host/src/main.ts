/**
 * Example host: bootstraps SAM with every module enabled. Useful as
 * - smoke-test target for `pnpm dev` against docker-compose,
 * - reference for tenants writing their own host (most will want
 *   to keep only the modules they care about, plus the IdP-specific
 *   group resolver).
 *
 * Configuration is read from `tenant.config.json` (path overridable
 * via TENANT_CONFIG env var). Database password and SMTP creds come
 * from the env vars referenced in the config (`passwordEnv` fields).
 */
import { bootstrap } from '@sam/core';

import wohnungen from '@sam/module-wohnungen';
import verwaltung from '@sam/module-verwaltung';
import telefonbuch from '@sam/module-telefonbuch';
import unterschriftenlisten from '@sam/module-unterschriftenlisten';
import verteiler, { setServices as setVerteilerServices } from '@sam/module-verteiler';
import drucker from '@sam/module-drucker';
import energie from '@sam/module-energie';
import waschkueche from '@sam/module-waschkueche';
import mailcow, {
  MailcowOptionsSchema,
  createMailcowMailer,
  startImapPoller,
} from '@sam/module-mailcow';

async function main(): Promise<void> {
  await bootstrap({
    modules: [
      wohnungen,
      verwaltung,
      telefonbuch,
      unterschriftenlisten,
      verteiler,
      drucker,
      energie,
      waschkueche,
      mailcow,
    ],
  });

  // After bootstrap finished, wire optional cross-module services.
  // The bootstrap helper doesn't expose the parsed config, so we
  // re-read from env/file in the few cases we need it. In a tenant's
  // own host you'd typically inline this with the bootstrap call.
  const { loadTenantConfig, consoleLogger } = await import('@sam/core');
  const config = await loadTenantConfig();
  const logger = consoleLogger();

  // ── Verteiler: inject Mailer + GroupResolver if available ────
  if (config.modules.mailcow?.enabled && config.modules.verteiler?.enabled) {
    const mcOpts = MailcowOptionsSchema.parse(config.modules.mailcow.options ?? {});
    const mailer = createMailcowMailer(mcOpts);
    setVerteilerServices({
      mailer,
      // Default resolver: NOT IMPLEMENTED — tenants supply their own.
      // The example throws to make the missing piece obvious.
      resolveGroup: async (groupName: string) => {
        throw new Error(
          `[example-host] no GroupResolver wired; group "${groupName}" cannot be resolved. ` +
            `Tenants must inject one (Authentik / LDAP / static map / ...).`,
        );
      },
    });
    logger.info('[example-host] verteiler wired with Mailcow mailer');

    // ── IMAP inbound (only when mailcow has an imap section) ──
    if (mcOpts.imap) {
      // The host could here adapt to verteiler.processInbound() — see
      // packages/modules/mailcow/README.md for the recommended snippet.
      logger.info('[example-host] IMAP poller is available — wire it in your tenant host');
    }
  }
}

main().catch((err) => {
  console.error('[example-host] fatal:', err);
  process.exit(1);
});
