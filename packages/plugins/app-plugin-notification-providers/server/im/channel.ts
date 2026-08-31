import type {
  NotificationChannelDefinition,
  NotificationContent,
  NotificationProviderIdentity,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';

export interface ImRecipient {
  readonly provider: NotificationProviderIdentity;
}

export interface ImMessage {
  readonly text: string;
  readonly title?: string;
  readonly actionUrl?: string;
  readonly format?: 'text' | 'markdown';
  readonly payloads?: {
    readonly feishu?: object;
    readonly dingtalk?: object;
  };
}

export interface PreparedImMessage {
  readonly recipient: ImRecipient;
  readonly content: ImMessage;
}

export interface ImProviderConfig {
  readonly type: string;
  readonly name: string;
  readonly enabled?: boolean;
  readonly target?: string;
}

export interface ImChannelConfig {
  readonly type: 'im';
  readonly enabled: boolean;
  readonly providers: readonly ImProviderConfig[];
}

export interface ImChannelDefinitionOptions {
  readonly resolveUserTarget?: (
    userId: string,
    provider: NotificationProviderIdentity,
  ) => Promise<ImRecipient | undefined>;
}

export function defineImChannelConfig(
  input: Omit<ImChannelConfig, 'type'>,
): ImChannelConfig {
  return { type: 'im', ...input };
}

export function createImChannelDefinition(
  options: ImChannelDefinitionOptions = {},
): NotificationChannelDefinition<
  ImChannelConfig,
  ImRecipient,
  ImMessage,
  PreparedImMessage
> {
  return {
    type: 'im',
    async createChannel(_context, config) {
      const providerTargets = new Map(
        config.providers.map((provider) => [
          providerKey(provider),
          normalizeTarget(provider.target),
        ]),
      );
      return {
        type: 'im',
        async resolveRecipient(input: {
          readonly recipient: NotificationRecipient;
          readonly provider: NotificationProviderIdentity;
        }): Promise<ImRecipient | undefined> {
          if (input.recipient.type === 'user') {
            const resolved = await options.resolveUserTarget?.(
              input.recipient.id,
              input.provider,
            );
            return sameProvider(resolved?.provider, input.provider)
              ? resolved
              : undefined;
          }
          if (
            input.recipient.type === 'target' &&
            providerTargets.get(providerKey(input.provider)) ===
              input.recipient.id
          )
            return { provider: input.provider };
          return undefined;
        },
        render(input: {
          readonly content: NotificationContent;
          readonly override?: Partial<ImMessage>;
        }): ImMessage {
          return {
            text: input.content.body,
            title: input.content.title,
            actionUrl: input.content.actionUrl,
            ...input.override,
          };
        },
        async prepare(input: {
          readonly recipient: ImRecipient;
          readonly message: ImMessage;
          readonly provider: NotificationProviderIdentity;
        }): Promise<PreparedImMessage> {
          if (!sameProvider(input.recipient.provider, input.provider))
            throw new Error(
              `IM webhook recipient must select Provider "${input.provider.name}".`,
            );
          if (!input.message.text.trim() && !input.message.payloads)
            throw new Error('IM text or provider payload is required.');
          return { recipient: input.recipient, content: input.message };
        },
      };
    },
  };
}

export function formatImText(message: ImMessage): string {
  return [message.title, message.text, message.actionUrl]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

function sameProvider(
  left: NotificationProviderIdentity | undefined,
  right: NotificationProviderIdentity,
): boolean {
  return left?.name === right.name && left.type === right.type;
}

function providerKey(provider: NotificationProviderIdentity): string {
  return `${provider.name}\0${provider.type}`;
}

function normalizeTarget(target: string | undefined): string {
  return target?.trim() || 'default';
}
