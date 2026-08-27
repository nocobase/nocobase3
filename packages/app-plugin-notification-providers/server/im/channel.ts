import type {
  NotificationChannelDefinition,
  NotificationContent,
  NotificationProviderIdentity,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';

export interface ImRecipient {
  readonly namespace: string;
  readonly providerName: string;
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
    async createChannel() {
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
            return resolved?.providerName === input.provider.name
              ? resolved
              : undefined;
          }
          if (
            input.recipient.type === 'external' &&
            (input.recipient.namespace === input.provider.type ||
              input.recipient.namespace === 'im') &&
            input.recipient.id === input.provider.name
          )
            return {
              namespace: input.recipient.namespace,
              providerName: input.recipient.id,
            };
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
          if (input.recipient.providerName !== input.provider.name)
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
