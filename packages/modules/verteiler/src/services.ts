import type { GroupResolver, Mailer } from './types.js';

/**
 * Module-level service registry. Hosts inject these via setServices()
 * before bootstrap. Without them, send/resolve calls throw.
 *
 * This keeps the module decoupled from any specific SMTP library or
 * group/identity backend (Authentik, LDAP, Keycloak, ...).
 */
export interface VerteilerServices {
  resolveGroup?: GroupResolver;
  mailer?: Mailer;
}

let services: VerteilerServices = {};

export function setServices(s: VerteilerServices): void {
  services = { ...services, ...s };
}

export function requireResolver(): GroupResolver {
  if (!services.resolveGroup) {
    throw new Error('[verteiler] no GroupResolver configured — call setServices({ resolveGroup })');
  }
  return services.resolveGroup;
}

export function requireMailer(): Mailer {
  if (!services.mailer) {
    throw new Error('[verteiler] no Mailer configured — call setServices({ mailer })');
  }
  return services.mailer;
}

export function getServices(): VerteilerServices {
  return services;
}
