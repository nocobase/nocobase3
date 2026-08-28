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
`FileThumbnail` for compact file identity, and `FilePreviewDialog` for
browser-native previews. The components support single and multiple uploads,
Public and Private files, expiring Private access URLs, and download fallback.

This item has no `extension.ts` and contains no route or server-side
implementation. Do not hard-code a
business collection, owner, or endpoint. Plugin upgrades do not overwrite the
installed copy; review changes with a three-way merge and keep application
customizations.
