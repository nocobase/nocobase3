# @nocobase/app-plugin-file

File storage, scoped access routes, client APIs, and reusable file UI for
NocoBase applications.

Integration guidance is available in the bundled
[`nocobase-app-plugin-file` Skill](skills/nocobase-app-plugin-file/SKILL.md).

`createFileRoute()` defaults to a 50 MiB single-file limit. Configure standard
tables through `database`, `table`, and optional `scope`; use the public
`FileStore` contract only for nonstandard schemas. The client exports
controlled upload, list, thumbnail, read-only preview field, and accessible
multi-file dialog components. The preview field can optionally show filenames,
and the dialog supports previous/next navigation from an initial file index.
Markdown previews use safe React rendering with GFM support and no raw HTML.
Office and OpenDocument files use Office Online only when their Public URL or
fresh Private access URL is an internet-accessible absolute HTTP(S) URL;
relative, localhost, blob, and failed embeds fall back to download.
Lists and dialogs expose `onError` for Private download URL failures, and
`download={false}` removes both toolbar and fallback download actions.
