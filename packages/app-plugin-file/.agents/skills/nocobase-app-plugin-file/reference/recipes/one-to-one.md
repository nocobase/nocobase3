# Recipe: one-to-one avatar

This recipe attaches one avatar to each profile. The unique owner constraint
protects the one-to-one shape; `maxFiles: 1` adds an earlier best-effort
business rejection. For a collection of files, use
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

Create the scoped Store and Route in the registrar. The table is a
server constant and `profileId` is validated before it reaches the query:

```ts
import { createFileRoute } from '@nocobase/app-plugin-file/server';
import type { MiddlewareHandler } from 'hono';

const requireAuth = app.container.resolve(authenticationToken).required();
const resolveAuthorization = app.container
  .resolve(authorizationToken)
  .middleware();
const managementAuth: MiddlewareHandler = (context, next) =>
  requireAuth(context, async () => {
    await resolveAuthorization(context, next);
  });

app.route(
  '/api/profiles/:profileId/avatar',
  createFileRoute({
    database: app.container.resolve(databaseManagerToken),
    table: 'profileAvatars',
    scope: (context) => {
      const raw = context.req.param('profileId');
      const profileId = Number(raw);
      if (!raw || !Number.isSafeInteger(profileId) || profileId < 1) {
        throw new TypeError('A valid profileId is required.');
      }
      return { profileId };
    },
    drive: app.container.resolve(driveManagerToken),
    defaultDisk: config.drive.default,
    publicBasePath: config.app.publicBasePath,
    tokenSecret: config.session.secret,
    audience: 'profile-avatar',
    auth: managementAuth,
    authorize: async (context, action) => {
      const profileId = context.req.param('profileId');
      const decision = await context.get('authz').authorize({
        resource: { type: 'profile', id: profileId },
        action: action === 'upload' || action === 'delete' ? 'update' : 'read',
      });
      if (decision.effect !== 'permit') {
        return context.json({ code: 'FORBIDDEN' }, 403);
      }
    },
    visibility: { default: 'private', allowClientOverride: false },
    limits: {
      maxSize: 5 * 1024 * 1024,
      maxFiles: 1,
      mimeTypes: ['image/png', 'image/jpeg'],
    },
  }),
);
```

The UNIQUE `profileId` constraint remains authoritative under concurrency;
`maxFiles: 1` is only a best-effort pre-upload check.

`managementAuth` runs only on the five management operations because it is
passed through the Route's `auth` option; Public or valid-Token content GET
remains session-independent.

For a database collection decision that returns conditional field or record
constraints, apply those conditions in the business query path as described
by the [authorization development Skill](../../../../../../authorization/skills/authorization-development/SKILL.md).
The file callback remains a hook into that existing system; it is not a new
file permission model.

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
