# File Plugin Development Rules

- This plugin owns Client/Server Repository managers, their original service tokens, route factories, and the component-ui Registry recipe. Business collections, migrations, concrete resources, and pages belong to applications or business plugins. The runnable example is packages/examples/app-plugin-file-example.
- Resolve the application's database, Drive, and API Client through their owning tokens. Never create a second connection, container, or API Client.
- Preserve the Repository implementation's current boundary: route authentication/authorization and advanced streaming (Range and conditional requests) are not built in. Document the application's responsibility for both API and content routes. Do not imply that a private disk, UUID, writePolicy, or login page authorizes requests.
- Registry components consume ClientFileRepository and FileRecord from the public ./client export. Their UI types and preview helpers live inside the recipe. Do not reintroduce the removed FilesClient protocol, file access tokens, inventory settings, or server implementation.
- File records contain stable metadata. contentUrl is derived, never persisted. Metadata deletion does not delete storage objects.
- README, Skills, exports, Registry metadata, and tests must describe the same contract. Installed Registry source belongs to the App. Test its compilation and observable behavior as a consumer.
- Tests belong under tests/. Run the package's check and the affected consuming applications' checks. Follow the repository's dependency, migration, and publication rules.
- Public documentation and comments are written in English.
