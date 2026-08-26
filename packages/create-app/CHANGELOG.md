# @nocobase/create-app

## 0.1.0-beta.0

### Minor Changes

- b3286fc: Add `@nocobase/create-app`, which scaffolds an application with `pnpm create @nocobase/app <directory>`. It prompts for the target directory and the database type, downloads the app template, installs the one driver that database needs, and writes `.env.local` with the connection settings and a generated `AUTH_SECRET`. Both answers can be passed as arguments instead, making the command usable from a script.
