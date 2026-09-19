# `@nocobase/realtime`

Shared realtime protocol and browser WebSocket client for NocoBase.

```ts
import { createRealtimeClient } from '@nocobase/realtime/client';

const realtime = createRealtimeClient({
  resolveUrl: () => '/ws',
});

const unsubscribe = realtime.subscribe<NotificationChanged>(
  'notifications:in-app',
  ({ payload }) => updateInbox(payload),
);

realtime.reconnect();
unsubscribe();
realtime.close();
```

Applications own URL resolution and client lifecycle. Authentication code can
call `reconnect()` after the browser session changes. Server implementations
share wire-message types and validation through `@nocobase/realtime/protocol`.
