# @nocobase/create-app

## 0.1.0-beta.5

### Minor Changes

- 1b5f10f: Accept `--template hub` in `create-app`, and scaffold a hub as a hub rather than as an app.

  A hub has no database, so the app flow was wrong for it in every step that touches one: it would have asked which dialect to use, added a driver dependency the hub never loads, and written a `config.yml` the hub never reads. A template now declares what it is through `nocobase.templateKind`, and `create-app` reads that to decide which flow applies — falling back to the package name so a local path to a checkout predating the field still works. The kind is settled after the template is downloaded, because a package specifier or a local path does not reveal it any earlier.

  A generated hub gets the scaffolding `nb3 hub create` already produced: `.env` derived from the template's `.env.example` with `APP_NAME` set to the project name, `.nb3/hub.json` so the `nb3 hub` commands can find it, `app-dist/` for the apps it serves, the runtime directories it writes into, and the matching `.gitignore` entries. `--db-dialect` is reported as ignored rather than silently dropped when it is passed alongside a hub template.

### Patch Changes

- 78cf0a2: Keep synchronized `.agents` content out of generated application source control while preserving local Plugin Skill synchronization and inspection.
- a7d4453: Synchronize plugin skills into a generated app after its dependencies are installed. The sync resolves plugins out of `node_modules`, so it can only run after the install; `create-app` now runs the app's own `plugin:skills:sync` script at that point, which leaves a new project carrying the skills of the plugins the template ships instead of an empty `.agents/skills/`.

  Skills are an assistive layer rather than something the app needs to boot, so a failed sync is reported as a warning along with the command to run by hand, and the generated project is still reported as created.

- d048955: Ignore local NocoBase runtime state in newly generated applications.

## 0.1.0-beta.4

### Patch Changes

- ad7ffd8: Set `trustLockfile` in generated applications, so installs stop re-auditing every lockfile entry against the supply-chain policy each time. The check queries registry metadata per package and re-verifies versions the lockfile already pins; newly resolved packages are still checked.

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
