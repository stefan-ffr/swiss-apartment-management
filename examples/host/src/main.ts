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
} from '@sam/module-mailcow';
import smtp2go, {
  Smtp2goOptionsSchema,
  createSmtp2goMailer,
} from '@sam/module-smtp2go';

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
      smtp2go,
    ],
  });

  // After bootstrap, wire optional cross-module services.
  const { loadTenantConfig, consoleLogger } = await import('@sam/core');
  const config = await loadTenantConfig();
  const logger = consoleLogger();

  // ── Pick a mail backend ────────────────────────────────────────
  // Mailcow takes precedence over SMTP2GO when both are enabled
  // (typical migration path: Mailcow becomes the new default,
  // SMTP2GO is kept as a fallback path).
  let mailerWired = false;
  if (config.modules.mailcow?.enabled && config.modules.verteiler?.enabled) {
    const mcOpts = MailcowOptionsSchema.parse(config.modules.mailcow.options ?? {});
    setVerteilerServices({
      mailer: createMailcowMailer(mcOpts),
      resolveGroup: defaultGroupResolverStub,
    });
    logger.info('[example-host] verteiler wired with Mailcow mailer');
    mailerWired = true;
  } else if (config.modules.smtp2go?.enabled && config.modules.verteiler?.enabled) {
    const sgOpts = Smtp2goOptionsSchema.parse(config.modules.smtp2go.options ?? {});
    setVerteilerServices({
      mailer: createSmtp2goMailer(sgOpts),
      resolveGroup: defaultGroupResolverStub,
    });
    logger.info('[example-host] verteiler wired with SMTP2GO mailer');
    mailerWired = true;
  }
  if (!mailerWired && config.modules.verteiler?.enabled) {
    logger.warn(
      '[example-host] verteiler is enabled but no mail backend (mailcow/smtp2go) is — sends will fail',
    );
  }
}

async function defaultGroupResolverStub(groupName: string): Promise<string[]> {
  throw new Error(
    `[example-host] no GroupResolver wired; group "${groupName}" cannot be resolved. ` +
      `Tenants must inject one (Authentik / LDAP / static map / ...).`,
  );
}

main().catch((err) => {
  console.error('[example-host] fatal:', err);
  process.exit(1);
});
