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
}

export function createNotificationRegistry(): NotificationRegistry {
  return new NotificationRegistry();
}
