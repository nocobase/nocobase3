# Notification Provider Routing API Research

Research date: 2026-08-28

## Question

Should provider fan-out be expressed as a property of the recipient, for example:

```ts
await notification.send({
  to: {
    type: 'provider',
    providerMode: 'broadcast',
  },
  channels: ['im'],
  content: { title: 'Notification', body: 'Send to Feishu and DingTalk' },
});
```

The current NocoBase API documents this form in [Sending notifications](../../packages/app-plugin-notification/docs/zh-CN/sending.md).

## Conclusion

The current shape is implementable, but it is not the best public API boundary. `to` should answer **who or which logical destination receives the notification**. Selecting one provider, all providers, or an ordered fallback chain answers **how the notification is delivered**, so it belongs in routing policy rather than in the recipient.

There is also a naming problem: established systems normally use “broadcast” or “fan-out” for expansion from one audience/topic to many recipients or subscribers. Using `broadcast` for duplicating one logical notification across provider integrations makes provider fan-out easy to confuse with recipient fan-out.

Recommended conceptual split:

| Concern                           | Suggested field               | Example                                       |
| --------------------------------- | ----------------------------- | --------------------------------------------- |
| Recipient or logical destination  | `to`                          | user, email address, topic, configured target |
| Delivery medium                   | `channels`                    | `im`, `email`, `in-app`                       |
| Provider selection policy         | `routing.<channel>.providers` | one, all, ordered fallback                    |
| Provider credentials and endpoint | configuration/integration     | Feishu webhook, DingTalk webhook              |

## Comparison with established systems

At a glance:

| System                   | Recipient / `to` model                                                  | Channel and provider choice                                                                 | Fan-out / broadcast model                                                                               |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Courier                  | User/profile, ad-hoc contact, list, or audience in `to`                 | `routing.method` and channel list; integrations are configured separately                   | `all` means every selected channel; lists/audiences are recipient expansion                             |
| Novu                     | Subscriber(s) or a Topic in `to`                                        | Workflow steps choose channels; integrations are environment-scoped                         | A Topic expands to one workflow event per subscriber; active chat/push integrations can run in parallel |
| Knock                    | `recipients` array of user/object references or inline recipients       | Workflow channel steps determine delivery; recipient data can include channel data          | Subscriptions/audiences fan out a workflow to recipients                                                |
| Firebase Cloud Messaging | Exactly one target form: token, topic, condition, or device group       | Message/platform payload is separate from target; credentials authorize the sender          | Topic/condition target expansion is audience semantics                                                  |
| Amazon SNS               | One target form: topic ARN, endpoint ARN, or phone number               | Protocol/endpoint subscriptions and topic configuration determine delivery                  | A topic publishes to every subscribed endpoint, possibly across protocols                               |
| Laravel Notifications    | Notifiable entity or ad-hoc channel route                               | Notification `via()` chooses channels; `routeNotificationFor*` supplies channel destination | Collections/queued sends can address many notifiables; `broadcast` is itself a channel                  |
| Symfony Notifier         | Recipient object containing email/phone (or channel-specific recipient) | `channel_policy` selects channels; named transports select provider                         | Multiple channels can be selected for an importance level; recipient remains separate                   |

### Courier

Courier is the closest match to the proposed send API. Its `to` field contains recipient identity or contact data, while a separate `routing` object controls channel selection. `routing.method: "single"` tries channels in order and stops after one succeeds; `routing.method: "all"` attempts every listed channel. Provider integrations are configured separately. This is direct evidence for keeping fan-out policy outside `to`. [Courier multi-channel routing](https://www.courier.com/docs/tutorials/sending/how-to-configure-multi-channel-routing) and [Courier sending overview](https://www.courier.com/docs/platform/sending/sending-overview).

Courier also models list and audience identifiers as recipient shapes in `to`, while still keeping delivery strategy under `routing`. This reinforces the distinction between audience expansion and transport routing. [Courier agent quickstart: recipients and routing](https://www.courier.com/docs/tools/agent-quickstart).

### Novu

Novu's trigger `to` identifies a subscriber or topic. A topic is explicitly a special recipient that expands to its subscribers, and Novu creates a separate workflow event for each subscriber. Channel delivery is defined by workflow steps, while provider connections are environment-scoped integrations. [Novu topics](https://docs.novu.co/platform/concepts/topics), [Novu subscribers](https://docs.novu.co/platform/concepts/subscribers), and [Novu framework introduction](https://docs.novu.co/framework/introduction).

Novu permits multiple active integrations per channel. For email and SMS it uses one primary integration by default; for push and chat it uses all active integrations in parallel. A specific email integration can be selected with `integrationIdentifier` in an email override, not by changing the recipient. [Novu integrations overview](https://docs.novu.co/platform/integrations) and [Novu email integrations](https://docs.novu.co/platform/integrations/email).

Novu is therefore especially relevant to the Feishu/DingTalk case: “all active chat integrations” is integration/channel behavior, while `to` remains the subscriber or topic.

### Knock

Knock's workflow trigger accepts a required `recipients` array containing user or object references. The workflow's channel steps determine delivery, and Knock produces a workflow run for each recipient. Subscriptions and audiences are the fan-out mechanisms, not provider flags embedded in a recipient. [Knock trigger API](https://docs.knock.app/send-notifications/triggering-workflows/api), [Knock workflow design](https://docs.knock.app/designing-workflows/overview), and [Knock concepts](https://docs.knock.app/concepts/overview).

### Firebase Cloud Messaging

FCM makes `token`, `topic`, and `condition` alternative message targets. A topic targets all subscribed app instances, so its fan-out is audience semantics. Platform-specific message configuration is separate from the target. [FCM HTTP v1 send targets](https://firebase.google.com/docs/cloud-messaging/send/v1-api) and [FCM topic messages](https://firebase.google.com/docs/cloud-messaging/send-topic-messages).

### Amazon SNS

Amazon SNS `Publish` chooses one target form: a topic ARN, a direct mobile endpoint ARN, or a phone number. Publishing to a topic causes SNS to replicate the message to the topic's subscriptions, potentially across different endpoint protocols. The topic is a logical destination whose subscription graph defines fan-out; provider/protocol endpoints are subscriptions rather than a mode attached to the message recipient. [SNS Publish API](https://docs.aws.amazon.com/sns/latest/api/API_Publish.html), [creating an SNS topic](https://docs.aws.amazon.com/sns/latest/dg/sns-create-topic.html), and [SNS fan-out overview](https://docs.aws.amazon.com/sns/latest/dg/welcome.html).

### Laravel Notifications and Symfony Notifier

Laravel sends to notifiable entities or ad-hoc channel routes, while the notification's `via` method chooses delivery channels. `routeNotificationFor*` supplies a destination for a particular channel. This keeps recipient routing data and channel selection distinct. Laravel also uses `broadcast` as the name of a real-time delivery channel, which is another reason not to overload the word for provider selection. [Laravel notifications](https://laravel.com/framework/docs/12.x/notifications).

Symfony separately models recipients, named transports, and channel policies. A policy such as `urgent: ['sms', 'chat/slack', 'email']` selects channels based on notification importance; `chatter_transports` and `texter_transports` name provider transports, while admin recipients independently hold email/phone destinations. [Symfony Notifier configuration](https://symfony.com/doc/current/reference/configuration/framework.html#notifier) and [creating and sending notifications](https://symfony.com/doc/7.2/notifier.html).

## Recommended NocoBase API

Prefer a channel-scoped routing strategy so that future email and IM policies can differ:

```ts
await notification.send({
  to: { type: 'target', id: 'ops-alerts' },
  channels: ['im'],
  routing: {
    im: {
      providers: { strategy: 'all' },
    },
  },
  content: {
    title: 'Notification',
    body: 'Send to Feishu and DingTalk',
  },
});
```

Suggested type direction:

```ts
type ProviderRouting =
  | {
      strategy?: 'single';
      provider?: NotificationProviderIdentity;
    }
  | {
      strategy: 'all';
      providers?: readonly NotificationProviderIdentity[];
    }
  | {
      strategy: 'fallback';
      providers: readonly NotificationProviderIdentity[];
    };

type NotificationRouting = Partial<
  Record<NotificationChannelType, { providers: ProviderRouting }>
>;
```

Semantics should be explicit:

- Omitted routing: use the channel's configured default/primary provider policy.
- `single` with a provider: use exactly that integration.
- `single` without a provider: use the configured primary provider.
- `all` without `providers`: create one independent delivery for every enabled provider in that channel.
- `all` with `providers`: fan out only to the named integrations.
- `fallback`: try providers in order until one succeeds; this is different from `all` and should not be inferred from it.

Use `all` rather than `broadcast` for provider routing. It follows Courier's established terminology and leaves `broadcast` available for its more common meaning: one logical audience expanding to many recipients.

## What to do about webhook providers that contain the destination

The current IM provider configuration contains the webhook URL, so a provider integration is both a transport adapter and a concrete group destination. That makes an explicit provider-shaped `to` defensible as a short-term implementation detail, but it does not make provider selection recipient policy.

There are two clean long-term options:

1. Introduce logical configured targets, such as `to: { type: 'target', id: 'ops-alerts' }`, and map that target to Feishu and DingTalk integration endpoints. This is the better model if multiple groups or tenant-specific destinations are expected.
2. For provider-addressed channels, allow a send overload without `to`; the provider integration itself supplies the endpoint, while `routing` selects one/all/fallback. This is simpler when there is only one configured destination per integration.

If neither larger change is desirable now, retain the current recipient union for compatibility but move `providerMode` into a top-level, channel-scoped `routing` object. That is the smallest change that restores the correct conceptual boundary.

## Operational requirements for `all`

Provider fan-out should continue to create one independent Delivery per provider. The parent notification should support a partial outcome because one integration may succeed while another fails. Idempotency and retries must be scoped per Delivery so retrying a failed DingTalk delivery does not resend the successful Feishu delivery. These are design consequences of `all`; the routing field should not imply a single atomic send.
