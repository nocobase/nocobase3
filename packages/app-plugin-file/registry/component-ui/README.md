# File Component UI

This Registry item installs editable application source for a file field. The
application supplies a `FilesClient` for its own business endpoint and owns the
installed components after materialization.

The default installation target is
`client/extensions/nocobase-file-component-ui`.

Import `createFilesClient`, `FilesClientError`, and the components from the
installed `index.ts`, or pass any object that implements the public
`FilesClient` contract. Use
`FileUploadField` for controlled upload values, `FileList` for actions,
`FileThumbnail` for compact file identity, `FilePreviewField` for read-only
thumbnail collections, and `FilePreviewDialog` for keyboard-accessible
multi-file previews. Upload success is driven entirely by the controlled
`value`; temporary pending, uploading, and error items stay internal. Use
`onStatusChange` to block form submission while uploading or after a failure.
Uploads can be cancelled and are aborted when the field unmounts.

The components allow relative and HTTP(S) content/access URLs, including
cross-origin HTTP(S) without credentials. They reject unsafe schemes such as
`javascript:` and external `data:` before rendering, downloading, or fetching.
Public and Private files, expiring Private access URLs, and download fallback
are supported.

This item has no `extension.ts` and contains no route or server-side
implementation. Do not hard-code a
business collection, owner, or endpoint. Plugin upgrades do not overwrite the
installed copy; review changes with a three-way merge and keep application
customizations.
