# @nocobase/app-plugin-realtime-example

Realtime app plugin example. When enabled, it adds a clock publisher and a
`/realtime` page that subscribes to the `clock:now` topic over WebSocket.

The explicit `server/plugin.ts` entry declares the Provider and root routes.
The Provider owns the publisher lifecycle, while the route definition owns the
`/realtime` page.
