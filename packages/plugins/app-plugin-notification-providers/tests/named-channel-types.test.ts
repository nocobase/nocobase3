import { expectTypeOf, it } from 'vitest';
import {
  createNotificationManager,
  type NotificationSendInput,
  type ConfiguredNotificationChannels,
} from '@nocobase/app-plugin-notification';
import { defineEmailChannelConfig } from '../server/email/channel.js';
import { defineImChannelConfig } from '../server/im/channel.js';

const channels = [
  defineEmailChannelConfig({
    name: 'system-email',
    enabled: true,
    providers: [],
  }),
  defineImChannelConfig({ name: 'alerts', enabled: true, providers: [] }),
] as const;

type Channels = ConfiguredNotificationChannels<typeof channels>;
type Input = NotificationSendInput<Channels>;

it('preserves configured names and the message contract of each implementation', () => {
  expectTypeOf<Input['channels'][number]>().toEqualTypeOf<
    'system-email' | 'alerts'
  >();
  expectTypeOf<
    NonNullable<Input['channelOverrides']>['system-email']
  >().toMatchTypeOf<{ subject?: string } | undefined>();
  expectTypeOf<
    NonNullable<Input['channelOverrides']>['alerts']
  >().toMatchTypeOf<{ format?: 'text' | 'markdown' } | undefined>();
  expectTypeOf(
    createNotificationManager({
      database: {} as never,
      queue: {} as never,
      logger: {} as never,
      config: { channels },
    }).send,
  )
    .parameter(0)
    .toEqualTypeOf<Input>();
});

it('rejects unknown instance names and message fields belonging to another type', () => {
  const valid: Input = {
    idempotencyKey: 'typed',
    channels: ['system-email'],
    content: { body: 'test' },
    channelOverrides: {
      'system-email': { subject: 'Hello' },
      alerts: { format: 'markdown' },
    },
  };
  const invalidName: Input = {
    ...valid,
    // @ts-expect-error Dispatch keys are configured names, not implementation types.
    channels: ['email'],
  };
  const invalidOverride: Input = {
    ...valid,
    channelOverrides: {
      // @ts-expect-error IM format is not an email message property.
      'system-email': { format: 'markdown' },
    },
  };
  expectTypeOf(invalidName).toEqualTypeOf<Input>();
  expectTypeOf(invalidOverride).toEqualTypeOf<Input>();
});
