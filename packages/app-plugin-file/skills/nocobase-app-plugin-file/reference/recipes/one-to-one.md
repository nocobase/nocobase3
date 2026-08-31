# Recipe: one-to-one avatar

This recipe attaches one avatar to each profile. The unique owner constraint
protects the one-to-one shape; `maxFiles: 1` adds an earlier rejection and
serializes uploads for the same owner within one Route instance. For a
collection of files, use
the [one-to-many recipe](one-to-many.md).

## Migration fragment

Create the owner collection first, then the standard file collection:

```ts
await builder.createCollection('profiles', (table) => {
  table.increments('id');
  table.string('name', { length: 255 }).notNull();
  table.datetime('createdAt').notNull();
  table.hasOne('avatar', 'profileAvatars').foreignKey('profileId');
});

await builder.createCollection('profileAvatars', (table) => {
  table.string('id', { length: 64 }).notNull();
  table.string('disk', { length: 64 }).notNull();
  table.string('key', { length: 512 }).notNull();
  table.string('filename', { length: 255 }).notNull();
  table.string('mimeType', { length: 255 }).notNull();
  table.bigInt('size').notNull();
  table.boolean('public').notNull().defaultTo(false);
  table.datetime('createdAt').notNull();
  table.datetime('updatedAt').notNull();
  table
    .belongsTo('profile', 'profiles')
    .foreignKey('profileId')
    .foreignKeyType('integer')
    .constraints(true)
    .unique();
  table.primary('id', { name: 'pk_profile_avatars' });
  table.unique(['disk', 'key'], { name: 'uq_profile_avatar_object' });
});
```

The `down` migration drops `profileAvatars` before `profiles`. Use the
repository's migration definition and current collection builder imports.

## Store and Route

Use the complete, type-checked
[profile avatar Route module](../examples/profile-avatar/routes.ts). It includes
all imports, typed configuration reads, middleware composition, scope
validation, authorization action mapping, `defineApiRoutes()`, and the default
`routes` export. Its inner path is `/profiles/:profileId/avatar`; the
Application adds `/api`.

The complete module must export `apiRoutes` and include it in the default
`routes` array, exactly as the tested example does. The UNIQUE `profileId`
constraint remains authoritative under concurrency;
`maxFiles: 1` cannot coordinate separate application instances.

`managementAuth` runs only on the five management operations because it is
passed through the Route's `auth` option; Public or valid-Token content GET
remains session-independent.

For a database collection decision that returns conditional field or record
constraints, apply those conditions in the business query path. The file
callback remains a hook into the existing authorization system; it is not a
new file permission model.

## Client setup

```tsx
import { createFilesClient } from '@nocobase/app-plugin-file/client/files-client';
import { FileUploadField } from '@nocobase/app-plugin-file/client/components';

const client = createFilesClient({
  endpoint: `/api/profiles/${profileId}/avatar`,
});

<FileUploadField
  client={client}
  value={avatar ? [avatar] : []}
  onChange={(next) => setAvatar(next[0] ?? null)}
  multiple={false}
  accept={['image/png', 'image/jpeg']}
  maxFiles={1}
/>;
```

The profile form owns the `profileId` relation and submits the business record.
It does not submit `disk`, `key`, a final URL, or a Token. Install the
`component-ui` Registry item only for application-owned UI customization; the
plugin runtime Demo remains available without Registry.

## Acceptance tests

Use Hono request tests with fake service/store/auth dependencies and a database
integration test for constraints:

```ts
it('allows the profile owner to upload one avatar', async () => {
  const response = await app.request('/api/profiles/7/avatar', {
    method: 'POST',
    body: multipartFile('avatar.png', 'image/png'),
  });
  expect(response.status).toBe(201);
});

it('denies a user without profile access', async () => {
  const response = await deniedApp.request('/api/profiles/7/avatar');
  expect(response.status).toBe(403);
});

it('rejects a second avatar at the one-to-one boundary', async () => {
  await insertAvatar({ profileId: 7 });
  await expect(insertAvatar({ profileId: 7 })).rejects.toThrow();
});

it('requires a Token for a Private avatar', async () => {
  const response = await app.request('/api/profiles/7/avatar/avatar-1/content');
  expect(response.status).toBe(401);
});
```

Also cover a valid Token stream, an expired or altered Token, Public access
after changing the record back to Private, size/MIME rejection before storage
write, scoped not-found, and deletion of both object and record.
