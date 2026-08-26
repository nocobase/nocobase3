# @nocobase/create-app

## 0.1.0-beta.1

### Patch Changes

- 31245b6: Keep the template's identity out of generated applications. The manifest no longer has its `version` reset or `private` added, so an app records which template release it came from; `displayName` and `description` are now dropped, which previously left a new app labelled "Default Template". Comment blocks in `.env.local` whose settings were replaced are removed along with them, instead of leaving headings with nothing under them.

## 0.1.0-beta.0

### Minor Changes

- b3286fc: Add `@nocobase/create-app`, which scaffolds an application with `pnpm create @nocobase/app <directory>`. It prompts for the target directory and the database type, downloads the app template, installs the one driver that database needs, and writes `.env.local` with the connection settings and a generated `AUTH_SECRET`. Both answers can be passed as arguments instead, making the command usable from a script.
