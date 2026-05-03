import type { Logger } from './types.js';

export function consoleLogger(): Logger {
  const stamp = () => new Date().toISOString();
  return {
    debug: (m, meta) => process.env.LOG_LEVEL === 'debug' && console.debug(`${stamp()} DEBUG ${m}`, meta ?? ''),
    info:  (m, meta) => console.log(`${stamp()} INFO  ${m}`, meta ?? ''),
    warn:  (m, meta) => console.warn(`${stamp()} WARN  ${m}`, meta ?? ''),
    error: (m, meta) => console.error(`${stamp()} ERROR ${m}`, meta ?? ''),
  };
}
