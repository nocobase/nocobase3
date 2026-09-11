# File Component UI

This Registry item installs editable App source for upload, list, thumbnail, and preview controls. The default destination is client/extensions/nocobase-file-component-ui. Import components and UI types from its index.ts.

Pass the public ClientFileRepository returned by the App's clientFileRepositoryManagerToken to FileUploadField as repository. Read-only components consume FileRecord arrays and their contentUrl directly; they require no repository prop. See the Registry components section in the plugin's SKILL.md for installation, dependencies, and a complete React example.

Upload success is controlled by value/onChange. Temporary progress and error items stay internal. Use onStatusChange to block form submission while uploading or after a failure. Upload cancellation forwards AbortSignal; it does not guarantee rollback after a server commit. removeOnDelete removes metadata only. App-owned business relations and physical cleanup remain the App's responsibility.

Preview handles safe raster images, PDF through a fetched local blob, audio/video, text, Markdown, and Office fallback. Active HTML/SVG/XML previews and unsafe URL schemes are rejected. Markdown does not execute raw HTML. Office Online requires an internet-accessible absolute URL and cannot use an App session; local URLs show a download fallback. Same-origin fetches include credentials; external fetches omit them. Bearer-only content policies need an App-owned authenticated blob adapter.

There is no public/private record flag or access-token endpoint. The item contains no extension.ts, route, collection, or Server implementation. A private disk does not authorize a content request. Installed copies belong to the App; review upgrades with a three-way merge and preserve customizations. Supply translated labels and adapt additional copy in installed source.
