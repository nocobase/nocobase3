# @nocobase/app-plugin-file

File storage, scoped access routes, client APIs, and reusable file UI for
NocoBase applications.

Integration guidance is available in the bundled
[`nocobase-app-plugin-file` Skill](.agents/skills/nocobase-app-plugin-file/SKILL.md).

`createFileRoute()` defaults to a 50 MiB single-file limit. Configure standard
tables through `database`, `table`, and optional `scope`; use the public
`FileStore` contract only for nonstandard schemas. The client exports
controlled upload, list, thumbnail, read-only preview field, and accessible
multi-file dialog components.
