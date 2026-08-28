# @nocobase/app-plugin-realtime-example

Realtime app plugin example. When enabled, it adds a clock publisher and a
`/realtime` page that subscribes to the `clock:now` topic over WebSocket.

The publisher is initialized from the convention-based `server/provider.ts`
entry and cleaned up through the ServiceProvider lifecycle.
