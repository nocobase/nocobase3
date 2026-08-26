# @nocobase/create-app

## 0.1.0-beta.3

### Patch Changes

- 8fb9319: Pin the pnpm version in generated applications. Without it the project runs on whatever pnpm the machine defaults to, and pnpm 10 does not read `allowBuilds` at all, so the database driver installs without compiling its native addon and fails only at the first query.

## 0.1.0-beta.2

### Patch Changes

- b269e38: Write the full `allowBuilds` list into every generated application rather than only the driver its database needs. `better-sqlite3` is listed even when another database was chosen, so switching an app to sqlite later works instead of failing with an error that names nothing actionable, and `@nocobase/app-portal-sdk` and `esbuild` are listed because the application installs both and pnpm 11 skips their build scripts otherwise.
- c13418c: Point the default template at the `latest` dist-tag instead of `beta`. changesets leaves `beta` on a package's first published version while tagging every release since as `latest`, so `beta` named the oldest template rather than the newest, and scaffolding from it produced an app missing settings that later releases added to `.env.example`.
- c13418c: Add `--template-tag` to choose which channel a named template is fetched from, `latest` (the default) or `beta`. A template given as a package specifier or a local path is unaffected, since it already says which version to use.

## 0.1.0-beta.1

### Patch Changes

- 31245b6: Keep the template's identity out of generated applications. The manifest no longer has its `version` reset or `private` added, so an app records which template release it came from; `displayName` and `description` are now dropped, which previously left a new app labelled "Default Template". Comment blocks in `.env.local` whose settings were replaced are removed along with them, instead of leaving headings with nothing under them.

## 0.1.0-beta.0

### Minor Changes

- b3286fc: Add `@nocobase/create-app`, which scaffolds an application with `pnpm create @nocobase/app <directory>`. It prompts for the target directory and the database type, downloads the app template, installs the one driver that database needs, and writes `.env.local` with the connection settings and a generated `AUTH_SECRET`. Both answers can be passed as arguments instead, making the command usable from a script.
