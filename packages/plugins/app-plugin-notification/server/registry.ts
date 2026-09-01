import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from './types.js';

/** Collects notification definitions without creating runtime resources. */
export class NotificationRegistry {
  private readonly channelDefinitions = new Map<
    string,
    NotificationChannelDefinition
  >();
  private readonly providerDefinitions = new Map<
    string,
    Map<string, NotificationProviderDefinition>
  >();

  registerChannel(definition: NotificationChannelDefinition): this {
    if (this.channelDefinitions.has(definition.type)) {
      throw new Error(
        `Notification Channel definition "${definition.type}" is already registered.`,
      );
    }
    this.channelDefinitions.set(definition.type, definition);
    return this;
  }

  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): this {
    const definitions =
      this.providerDefinitions.get(channelType) ??
      new Map<string, NotificationProviderDefinition>();
    if (definitions.has(definition.type)) {
      throw new Error(
        `Notification Provider definition "${definition.type}" is already registered for Channel "${channelType}".`,
      );
    }
    definitions.set(definition.type, definition);
    this.providerDefinitions.set(channelType, definitions);
    return this;
  }

  channel(type: string): NotificationChannelDefinition | undefined {
    return this.channelDefinitions.get(type);
  }

  provider(
    channelType: string,
    providerType: string,
  ): NotificationProviderDefinition | undefined {
    return this.providerDefinitions.get(channelType)?.get(providerType);
  }

  testTargets(
    config: import('./types.js').NotificationConfig,
  ): readonly import('./types.js').NotificationTestTargetDescriptor[] {
    return config.channels.flatMap((channelConfig) => {
      if (!channelConfig.enabled) return [];
      const channel = this.channel(channelConfig.type);
      if (!channel?.test) return [];
      const test = channel.test;
      return channelConfig.providers.flatMap((providerConfig) => {
        if (providerConfig.enabled === false) return [];
        const provider = this.provider(channelConfig.type, providerConfig.type);
        if (!provider) return [];
        return [
          {
            channel: {
              type: channelConfig.type,
              label: test.label,
            },
            provider: {
              name: providerConfig.name,
              type: providerConfig.type,
              label: provider.label ?? providerConfig.type,
            },
            fields: test.fields.map((field) => ({
              name: field.name,
              label: field.label,
              type: field.type,
              ...(field.required === undefined
                ? {}
                : { required: field.required }),
              ...(field.placeholder === undefined
                ? {}
                : { placeholder: field.placeholder }),
              ...(field.defaultValue === undefined
                ? {}
                : { defaultValue: field.defaultValue }),
              ...(field.maxLength === undefined
                ? {}
                : { maxLength: field.maxLength }),
            })),
          },
        ];
      });
    });
  }

  validate(config: import('./types.js').NotificationConfig): void {
    for (const channelConfig of config.channels) {
      if (!channelConfig.enabled) continue;
      const channel = this.channel(channelConfig.type);
      if (!channel) {
        throw new Error(
          `Notification Channel definition "${channelConfig.type}" is not registered.`,
        );
      }
      channel.validateConfig?.(channelConfig);
      const names = new Set<string>();
      let enabledProviderCount = 0;
      for (const providerConfig of channelConfig.providers) {
        if (providerConfig.enabled === false) continue;
        enabledProviderCount += 1;
        if (names.has(providerConfig.name)) {
          throw new Error(
            `Provider name "${providerConfig.name}" is duplicated in Channel "${channelConfig.type}".`,
          );
        }
        names.add(providerConfig.name);
        const provider = this.provider(channelConfig.type, providerConfig.type);
        if (!provider) {
          throw new Error(
            `Provider definition "${providerConfig.type}" is not registered for Channel "${channelConfig.type}".`,
          );
        }
        provider.validateConfig?.(providerConfig);
      }
      if (enabledProviderCount === 0) {
        throw new Error(
          `Enabled Channel "${channelConfig.type}" requires at least one enabled Provider.`,
        );
      }
    }
  }
}

export function createNotificationRegistry(): NotificationRegistry {
  return new NotificationRegistry();
}
