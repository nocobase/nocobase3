export type ProviderErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'invalid_request'
  | 'invalid_recipient'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'network'
  | 'timeout'
  | 'internal';

export interface ProviderError {
  readonly category: ProviderErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowFallback: boolean;
}

export type ProviderSendResult =
  | { readonly status: 'accepted'; readonly providerMessageId?: string; readonly metadata?: Record<string, unknown> }
  | { readonly status: 'failed'; readonly error: ProviderError }
  | { readonly status: 'submission_unknown'; readonly error: Omit<ProviderError, 'retryable' | 'allowFallback'> };

export interface EmailProviderMessage {
  readonly messageId: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface EmailProvider {
  readonly instanceId: string;
  readonly providerType: 'smtp' | 'fake';
  readonly configRevision: string;
  checkConnection(): Promise<void>;
  send(message: EmailProviderMessage): Promise<ProviderSendResult>;
  close(): Promise<void>;
}

export interface EmailProviderInstance {
  readonly id: string;
  readonly enabled: boolean;
  readonly provider: EmailProvider;
}

export interface EmailProviderRegistry {
  get(id: string): EmailProviderInstance | undefined;
  list(): readonly EmailProviderInstance[];
}

export function createEmailProviderRegistry(instances: readonly EmailProviderInstance[]): EmailProviderRegistry {
  const byId = new Map<string, EmailProviderInstance>();
  for (const instance of instances) {
    if (byId.has(instance.id) || instance.id !== instance.provider.instanceId) {
      throw new Error(`Invalid or duplicate email provider instance "${instance.id}".`);
    }
    byId.set(instance.id, instance);
  }
  return { get: (id): EmailProviderInstance | undefined => byId.get(id), list: (): readonly EmailProviderInstance[] => [...byId.values()] };
}
