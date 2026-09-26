---
'@nocobase/hub-installer': minor
---

pm2 runs a `launcher.mjs` in the Hub root, which reads `hub.env` and resolves `current` every time the process starts and then becomes the Hub through `process.execve`, keeping the pid pm2 watches. A plain `pm2 restart` therefore applies an edited `hub.env`, which is how the origin or port is changed. `status` and `install` report `endpoints`: the public URL and origin, and the host and port the Hub listens on. `install` reports `initialAdmin`: the first administrator's username and email and whether its password is still the template default, never the password itself. `install` takes `--dir` like the other commands, and pm2 4.3 or later is required.

Every command an error suggests, and every example in `--help`, runs as printed: `npx --yes --registry=… @nocobase/hub-installer@<this version> …`, with paths quoted for the shell. Under `--json`, `--version` and an unsupported Node.js print the same envelope as every other command, the latter with `NODE_UNSUPPORTED`, and the document is flushed to a pipe in full before the process exits. The README lists every error code with its exit code.
