---
'@nocobase/app-template-default': patch
---

Fix `pnpm app:dev` hanging at `Starting app dev server...` when a stale process from another project still listens on the Vite port. Port selection bound the wildcard address `0.0.0.0`, which succeeds even when another process holds `127.0.0.1` on the same port, while the readiness probe requested that loopback address and reached the other process instead. The dev server therefore polled a foreign server for two minutes and failed with a misleading `HTTP 404`.

Port selection now also probes the loopback addresses behind a wildcard host, so it picks a port that the readiness probe can actually reach. Only a genuine `EADDRINUSE` rules a port out, which keeps hosts without an IPv6 stack from discarding usable ports.
