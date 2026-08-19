# Notification Management

The notification management context describes how one logical notification is expanded into recipient-specific, channel-specific delivery work and recorded for user-facing inboxes and audit.

## Language

**Channel**:
The medium through which a notification reaches a recipient, currently in-app or email.
_Avoid_: Provider, transport

**Provider Type**:
A supported kind of third-party or built-in delivery integration, currently database, SMTP, or Fake.
_Avoid_: Provider, transport

**Provider Instance**:
A server-configured delivery account for one Provider Type, including its stable identity, enabled state, fixed order, operational options, and secret references.
_Avoid_: Provider, provider account

**Recipient**:
A person targeted by a notification, identified by a NocoBase user reference or a directly supplied channel address.
_Avoid_: Subscriber, receiver

**Notification**:
One logical notification trigger and the shared intent and context from which recipient deliveries are derived.
_Avoid_: Message, event

**Channel Content Snapshot**:
The immutable, validated rendered content used for every attempt of one Delivery, whether supplied directly or produced from a Template Definition.
_Avoid_: Template, current content

**Template Definition**:
A developer-registered, named declaration that renders channel content from validated common and recipient-specific variables.
_Avoid_: Template record, editable template, message content

**Template Context**:
The explicit common, recipient-specific, and minimal identity values supplied to one Template Definition for one Recipient.
_Avoid_: User object, runtime globals, implicit variables

**Delivery**:
The channel-specific delivery of a Notification to one Recipient.
_Avoid_: Message, send task

**Accepted Delivery**:
A Delivery whose Provider explicitly acknowledged submission, without evidence that it reached the Recipient.
_Avoid_: Delivered Delivery, successful delivery

**Delivered Delivery**:
A Delivery with affirmative evidence that it reached its destination; making the Notification available in the Recipient's notification center is sufficient evidence for the in-app Channel.
_Avoid_: Accepted Delivery, submitted delivery

**Submission-Unknown Delivery**:
A Delivery whose Provider submission may have succeeded but cannot be confirmed, so automatic retry and Fallback must stop.
_Avoid_: Failed Delivery, timed-out delivery

**Delivery Attempt**:
One attempt to execute a Delivery through one Provider Instance.
_Avoid_: Retry, send log

**User Notification Item**:
A NocoBase user's Portal-facing view of one user-addressed Delivery for one Channel, with independent read and deletion state.
_Avoid_: Inbox Item, cross-channel aggregate, email-open record

**Live Event**:
A transient, recipient-scoped signal emitted after a User Notification Item change so an authorized client can reconcile with persisted state.
_Avoid_: Notification, Delivery Status Event, source of truth

**Portal Live Runtime**:
The notification-independent module that owns same-origin WebSocket connections, authenticated subscriptions, short replay buffers, the Refine LiveProvider client, and a replaceable Live Bus Adapter.
_Avoid_: Notification worker, NocoBase WebSocket proxy, source of truth

**Live Publisher**:
The server-side interface through which a domain module publishes a recipient-scoped invalidation signal after its database transaction commits.
_Avoid_: Client publish, WebSocket connection, durable event store

**Live Cursor**:
The transient stream identity and sequence last observed by a client, used only for short replay or deciding that HTTP resynchronization is required.
_Avoid_: Database cursor, Inbox version, global sequence

**Provider Chain**:
The fixed ordered list of Provider Instances that may attempt a Delivery for one Channel.
_Avoid_: Route Policy, routing script

**Delivery Status Event**:
An immutable record of a Delivery state transition reported by the notification worker or a Provider receipt.
_Avoid_: Delivery log, callback

**Event Queue**:
An adapter-backed work signal transport that publishes Delivery identifiers to workers; messages may be duplicated or lost, so it is never the source of delivery truth.
_Avoid_: Delivery store, database queue, source of truth

**Notification Dispatcher**:
The notification-domain module that consumes Event Queue signals, atomically starts eligible Deliveries, creates Attempts, invokes Providers, and persists outcomes.
_Avoid_: Event Queue, Provider Adapter

**Notification Reconciler**:
The notification-domain recovery loop that republishes due queued Deliveries and moves stale sending Attempts to submission-unknown according to persisted state.
_Avoid_: Queue retry, scheduler, polling worker

**Principal**:
A trusted user or system identity established outside Trigger input and used for authorization and audit.
_Avoid_: Request actor, source, caller-supplied user

**Identity Provider**:
The injected boundary that validates a Portal request or live connection and returns a trusted NocoBase-backed user Principal.
_Avoid_: Notification account system, token parser, ACL policy

**Authorization Policy**:
The injected boundary that decides whether a trusted Principal has a notification capability.
_Avoid_: Frontend route guard, role header, identity provider

**Recipient Profile Resolver**:
The least-privileged Trigger-time boundary that resolves delivery-required fields for explicitly named NocoBase user IDs before immutable Recipient Snapshots are persisted.
_Avoid_: User search, group resolver, worker identity
