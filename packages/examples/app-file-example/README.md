# File Example

@nocobase/app-file-example demonstrates the public File Repository services from @nocobase/app-plugin-file. It owns the attachments migration, concrete resource/content routes, development page, and translations. The core plugin owns generic managers, tokens, providers, route helpers, and the editable component-ui Registry.

Register the core before this example in both client/plugins.ts and server/plugins.ts. The Client exports are factories; Server exports are declarations. In a source workspace, use the full example package name:

    pnpm plugin:register @nocobase/app-file-example --app app-template-default

The default template already registers the example. Hub keeps its existing core-only File registration. Run the target App's migrations to create attachments, then open /dev/file-repository. The page demonstrates single/batch uploads, querying, opening returned content URLs, and metadata deletion.

The resource uses the main connection, local disk, and stream access:

- POST /api/attachments:findMany, findOne, count, exists, deleteOne, uploadOne, uploadMany.
- GET /uploads/attachments/uuid.ext, without a dot for extensionless files.

The content route is outside /api. HTTP contentUrl already includes any host prefix such as /main. The page resolves clientFileRepositoryManagerToken and calls manager.repository('attachments').

The example is a public demonstration. Its Server routes are not restricted to development and have no built-in authentication or authorization; the development-only Client page is not a security boundary. Metadata deletion retains physical objects; Range/206 and conditional requests are unsupported. Business applications should own their collection names, routes, relations, and access policy. Read the [core Skill](../../plugins/app-plugin-file/skills/nocobase-app-plugin-file/SKILL.md) before adapting it.

The existing migration is moved unchanged, including its name and contents. Tests verify that previous execution under the old example or former core package is recognized and does not recreate the table. Existing legacy File schemas are separate and are not migrated by this example.
