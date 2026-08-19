# Notification module documentation

The notification module is temporarily compiled and mounted directly by the default App Template. Its stable integration surface and current runtime contract are documented in [server-integration.md](server-integration.md).

- [Trigger interface](trigger-interface.md): the internal TypeScript calling surface for other services to create notifications (source / targets / content, validation errors, semantics).
- [Portal Live](portal-live.md): same-origin real-time Inbox refresh channel, wire protocol, server modules, and HTTP upgrade wiring.

Planned documents will cover provider configuration, queue integration, and operational recovery as their implementation slices land. HTTP triggering is out of the current module scope and will be revisited with identity/ACL.
