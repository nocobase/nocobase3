import { defineConfig, type ConfigFactory } from "@nocobase/app-server/config";
import {
  defineEmailChannelConfig,
  type EmailChannelConfig,
} from "@nocobase/notification-email";
import {
  defineInAppChannelConfig,
  type InAppChannelConfig,
} from "@nocobase/notification-in-app";

export interface AppNotificationConfig {
  readonly enabled: boolean;
  readonly allowNonPersistentStore: boolean;
  readonly channels: readonly [InAppChannelConfig, EmailChannelConfig];
  readonly logs: { readonly enabled: boolean; readonly retainDays: number };
}

const notificationConfig: ConfigFactory<AppNotificationConfig> = defineConfig(
  ({ env }): AppNotificationConfig => ({
    enabled: env.boolean("NOTIFICATION_ENABLED", false),
    allowNonPersistentStore: env.boolean(
      "NOTIFICATION_ALLOW_NON_PERSISTENT_STORE",
      false,
    ),
    channels: [
      defineInAppChannelConfig({
        enabled: env.boolean("NOTIFICATION_IN_APP_ENABLED", true),
        providers: [{ type: "database", name: "primary" }],
      }),
      defineEmailChannelConfig({
        enabled: env.boolean("NOTIFICATION_EMAIL_ENABLED", false),
        providers: [],
      }),
    ],
    logs: { enabled: true, retainDays: 90 },
  }),
);

export default notificationConfig;
