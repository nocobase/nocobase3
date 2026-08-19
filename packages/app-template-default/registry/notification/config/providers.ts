import { createHash } from 'node:crypto';

import { createEmailProviderRegistry, createFakeEmailProvider, createSmtpProvider, type EmailProviderRegistry, type SmtpClient } from '../providers/index.js';

export interface SmtpProviderDefinition {
  readonly id: string;
  readonly type: 'smtp';
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly usernameSecret?: string;
  readonly passwordSecret?: string;
}

export interface FakeProviderDefinition {
  readonly id: string;
  readonly type: 'fake';
  readonly enabled: boolean;
}

export type EmailProviderDefinition = SmtpProviderDefinition | FakeProviderDefinition;

export interface SmtpClientConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username?: string;
  readonly password?: string;
}

export interface CreateConfiguredEmailProvidersOptions {
  readonly definitions: readonly EmailProviderDefinition[];
  readonly production: boolean;
  readonly resolveSecret: (reference: string) => Promise<string | undefined>;
  readonly createSmtpClient: (config: SmtpClientConfig) => SmtpClient;
}

export async function createConfiguredEmailProviders(options: CreateConfiguredEmailProvidersOptions): Promise<EmailProviderRegistry> {
  const instances = [];
  const ids = new Set<string>();
  for (const definition of options.definitions) {
    validateDefinition(definition, ids);
    if (!definition.enabled) continue;
    if (definition.type === 'fake') {
      if (options.production) throw new Error(`Fake provider "${definition.id}" is not allowed in production.`);
      const provider = createFakeEmailProvider({ instanceId: definition.id, configRevision: revision(definition) });
      instances.push({ id: definition.id, enabled: true, provider });
      continue;
    }
    const username = definition.usernameSecret ? await options.resolveSecret(definition.usernameSecret) : undefined;
    const password = definition.passwordSecret ? await options.resolveSecret(definition.passwordSecret) : undefined;
    if ((definition.usernameSecret && !username) || (definition.passwordSecret && !password)) throw new Error(`Required SMTP Secret for "${definition.id}" is unavailable.`);
    const provider = createSmtpProvider({ instanceId: definition.id, configRevision: revision(definition), client: options.createSmtpClient({ host: definition.host, port: definition.port, secure: definition.secure, username, password }) });
    instances.push({ id: definition.id, enabled: true, provider });
  }
  return createEmailProviderRegistry(instances);
}

function validateDefinition(definition: EmailProviderDefinition, ids: Set<string>): void {
  if (!/^email\/(smtp|fake)\/[a-z0-9][a-z0-9-]*$/.test(definition.id) || ids.has(definition.id)) throw new Error(`Invalid or duplicate Provider Instance ID "${definition.id}".`);
  ids.add(definition.id);
  if (definition.type === 'smtp' && (!definition.host || !Number.isInteger(definition.port) || definition.port < 1 || definition.port > 65535)) throw new Error(`SMTP provider "${definition.id}" has invalid connection settings.`);
}

function revision(definition: EmailProviderDefinition): string {
  const publicConfig = definition.type === 'smtp'
    ? { id: definition.id, type: definition.type, enabled: definition.enabled, host: definition.host, port: definition.port, secure: definition.secure, usernameSecret: definition.usernameSecret, passwordSecret: definition.passwordSecret }
    : definition;
  return createHash('sha256').update(JSON.stringify(publicConfig)).digest('hex').slice(0, 16);
}
