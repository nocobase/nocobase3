import type { EmailProvider, EmailProviderMessage, ProviderSendResult } from './types.js';

export interface FakeEmailProviderOptions {
  readonly instanceId: string;
  readonly configRevision?: string;
  readonly outcomes?: readonly ProviderSendResult[];
}

export interface FakeEmailProvider extends EmailProvider {
  readonly messages: readonly EmailProviderMessage[];
}

export function createFakeEmailProvider(options: FakeEmailProviderOptions): FakeEmailProvider {
  const messages: EmailProviderMessage[] = [];
  const outcomes = [...(options.outcomes ?? [{ status: 'accepted' as const }])];
  return {
    instanceId: options.instanceId,
    providerType: 'fake',
    configRevision: options.configRevision ?? 'fake-v1',
    messages,
    async checkConnection(): Promise<void> {},
    async send(message): Promise<ProviderSendResult> {
      messages.push(structuredClone(message));
      return outcomes.shift() ?? { status: 'accepted' };
    },
    async close(): Promise<void> {},
  };
}
