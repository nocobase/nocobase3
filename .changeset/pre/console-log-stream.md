---
'@nocobase/logging': minor
'@nocobase/app-server': minor
---

Console log records can go to stderr. `console.stream: 'stderr'` in the logging output options writes them there instead of stdout, and a standalone scope's `consoleLogStream` sets it for an application without touching its logging configuration. The application command line uses this for every application a command creates, so records never mix with a command's `--json` document on stdout. Servers are unaffected: without the option, records go to stdout as before.
