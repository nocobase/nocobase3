import { randomUUID } from 'node:crypto';

import type {
  NotificationProviderDefinition,
  NotificationProviderSendInput,
  ProviderSendResult,
} from '@nocobase/app-plugin-notification';
import { createConfigEnv, type EnvMap } from '@nocobase/app-server-kit/config';
import {
  createResendProviderDefinition,
  createSmtpProviderDefinition,
  type PreparedEmailMessage,
  type ResendProviderConfig,
  type SmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  type DingTalkWebhookProviderConfig,
  type FeishuWebhookProviderConfig,
  type PreparedImMessage,
} from '@nocobase/app-plugin-notification-providers/im';
import { createLogging, type Logger } from '@nocobase/logging';

import loggingConfig from '../server/config/logging.js';
import {
  createNotificationConfig,
  type AppNotificationChannelConfig,
} from '../server/config/notification.js';
import {
  createRuntimeConfigPaths,
  resolveStandaloneRuntimeOptions,
} from '../server/runtime/options.js';

type SmokeTestProviderConfig =
  | SmtpProviderConfig
  | ResendProviderConfig
  | FeishuWebhookProviderConfig
  | DingTalkWebhookProviderConfig;

await run();

async function run(): Promise<void> {
  const requestedProvider = process.argv[2]?.trim().toLowerCase();
  if (
    !requestedProvider ||
    !['smtp', 'resend', 'feishu', 'dingtalk'].includes(requestedProvider)
  ) {
    throw new Error('Pass a Provider name: smtp, resend, feishu, or dingtalk.');
  }

  const runtimeOptions = resolveStandaloneRuntimeOptions(
    new URL('../server/standalone.ts', import.meta.url).href,
  );
  const providerEnv: EnvMap = {
    ...runtimeOptions.env,
    ...(requestedProvider === 'smtp' || requestedProvider === 'resend'
      ? { NOTIFICATION_EMAIL_PROVIDER: requestedProvider }
      : { NOTIFICATION_IM_PROVIDER: requestedProvider }),
  };
  const notificationConfig = createNotificationConfig(
    createConfigEnv(providerEnv),
  );
  const providerConfig = findProviderConfig(
    notificationConfig.channels,
    requestedProvider,
  );
  if (!providerConfig)
    throw new Error(`Provider "${requestedProvider}" is not configured.`);

  const logging = createLogging(
    loggingConfig({
      env: createConfigEnv(runtimeOptions.env),
      paths: createRuntimeConfigPaths(runtimeOptions.paths),
    }),
  );
  const logger = logging.getLogger().child({ module: 'notification-test' });
  try {
    const result = await sendTestMessage(
      providerConfig,
      logger,
      providerEnv.TEST_EMAIL_RECIPIENT,
    );
    printResult(requestedProvider, result);
    if (result.status === 'failed') process.exitCode = 1;
    if (result.status === 'submission_unknown') process.exitCode = 2;
  } finally {
    await logging.flush();
  }
}

function findProviderConfig(
  channels: readonly AppNotificationChannelConfig[],
  name: string,
): SmokeTestProviderConfig | undefined {
  for (const channel of channels) {
    const provider = channel.providers.find(
      (candidate) => candidate.name === name,
    );
    if (provider) return provider;
  }
  return undefined;
}

async function sendTestMessage(
  config: SmokeTestProviderConfig,
  logger: Logger,
  testEmailRecipient: string | undefined,
): Promise<ProviderSendResult> {
  if (config.type === 'smtp') {
    return sendWithDefinition(
      createSmtpProviderDefinition(),
      config,
      createEmailMessage(
        requiredValue(testEmailRecipient, 'TEST_EMAIL_RECIPIENT'),
      ),
      logger,
    );
  }
  if (config.type === 'resend') {
    return sendWithDefinition(
      createResendProviderDefinition(),
      config,
      createEmailMessage(
        requiredValue(testEmailRecipient, 'TEST_EMAIL_RECIPIENT'),
      ),
      logger,
    );
  }
  if (config.type === 'feishu-webhook') {
    return sendWithDefinition(
      createFeishuWebhookProviderDefinition(),
      config,
      createImMessage(config),
      logger,
    );
  }
  return sendWithDefinition(
    createDingTalkWebhookProviderDefinition(),
    config,
    createImMessage(config),
    logger,
  );
}

async function sendWithDefinition<
  TConfig extends {
    readonly type: string;
    readonly name: string;
    readonly enabled?: boolean;
  },
  TMessage extends object,
>(
  definition: NotificationProviderDefinition<TConfig, TMessage>,
  config: TConfig,
  message: TMessage,
  logger: Logger,
): Promise<ProviderSendResult> {
  const provider = await definition.createProvider(
    {
      logger,
      now: async (): Promise<string> => new Date().toISOString(),
    },
    config,
  );
  const deliveryId = randomUUID();
  const input: NotificationProviderSendInput<TMessage> = {
    message,
    notificationId: randomUUID(),
    deliveryId,
    attemptId: randomUUID(),
    deadline: new Date(Date.now() + 20_000).toISOString(),
    signal: AbortSignal.timeout(20_000),
  };

  try {
    return await provider.send(input);
  } finally {
    await provider.close?.();
  }
}

function createEmailMessage(address: string): PreparedEmailMessage {
  return {
    to: address,
    content: {
      subject: 'NocoBase notification Provider test',
      text: `Provider smoke test sent at ${new Date().toISOString()}.`,
    },
  };
}

function createImMessage(provider: {
  readonly name: string;
  readonly type: string;
}): PreparedImMessage {
  return {
    recipient: { provider },
    content: {
      title: 'NocoBase notification Provider test',
      text: `Provider smoke test sent at ${new Date().toISOString()}.`,
    },
  };
}

function requiredValue(value: string | undefined, key: string): string {
  value = value?.trim();
  if (value) return value;
  throw new Error(`${key} is required for this smoke test.`);
}

function printResult(provider: string, result: ProviderSendResult): void {
  if (result.status === 'accepted') {
    console.log(
      `${provider}: accepted${result.providerMessageId ? ` (${result.providerMessageId})` : ''}`,
    );
    return;
  }

  const code = result.error.code ? ` [${result.error.code}]` : '';
  console.error(`${provider}: ${result.status}${code} ${result.error.message}`);
}
