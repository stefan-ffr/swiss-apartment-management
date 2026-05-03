/**
 * CLI: `pnpm migrate`
 *
 * Runs pending migrations for all enabled modules. The actual module
 * imports happen here so the core stays generic.
 *
 * TODO: discover modules dynamically from `tenant.config.json#modules`
 *       once the module packages exist. For now it's a stub.
 */
import { loadTenantConfig } from '../config.js';
import { consoleLogger } from '../logger.js';

async function main(): Promise<void> {
  const logger = consoleLogger();
  const config = await loadTenantConfig();
  logger.info(`Loaded tenant ${config.tenant.id}`);
  logger.info('Module migration discovery not yet implemented — placeholder.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
