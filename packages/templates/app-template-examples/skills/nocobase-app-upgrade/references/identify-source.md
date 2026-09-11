# Identifying the source template

An upgrade needs two things from the application: which template package it came from, and which release of that package is already merged in. Both live under `nocobase` in `package.json`.

```json
{
  "nocobase": {
    "templateKind": "app",
    "templatePackage": "@nocobase/app-template-examples",
    "defaultTemplateVersion": "1.0.0-beta.21"
  }
}
```

## When `templatePackage` is missing

Applications generated before the field existed do not carry it. `@nocobase/app-template-default` is the default answer — it is what `pnpm create @nocobase/app` produces unless `--template` said otherwise, so it is what most applications without the field came from.

Default is the assumption to start from, not a conclusion to act on. Diffing the wrong template produces a delta full of changes that were never in this application's history, and working from it corrupts the project. So confirm it before fetching anything, and note that `templateKind` does not settle it on its own: both `app-template-default` and `app-template-examples` declare `app`.

Three checks confirm or overturn it:

**The version line is the strongest signal.** The three templates are on separate release lines, so a `defaultTemplateVersion` usually belongs to only one of them. Check what each has published rather than relying on remembered numbers:

```bash
npm view @nocobase/app-template-default versions --registry=https://npm.nocobase.ai
npm view @nocobase/app-template-examples versions --registry=https://npm.nocobase.ai
npm view @nocobase/app-template-hub versions --registry=https://npm.nocobase.ai
```

If the recorded version exists in exactly one of them, that is almost certainly the source.

**Content distinguishes Default from Examples.** Examples ships demonstration pages, an article module, and example plugin registrations; Default ships a localized homepage and no example plugins. An `app-plugin-*-example` entry in `client/plugins.ts` or `server/plugins.ts` that the user did not add points at Examples.

**Hub is unmistakable.** It is configured through `.env` rather than `config.yml` and has no database; `templateKind` reads `hub`.

Confirm the conclusion with the user before fetching anything. Once they confirm, write the field so the next upgrade does not repeat this:

```json
"templatePackage": "@nocobase/app-template-examples"
```

## When `defaultTemplateVersion` is wrong or missing

The field records the template release already merged. If it is absent, or the user says it was bumped without the corresponding merge, the baseline is unknown and every approach from here is a guess.

Do not pick a baseline yourself. Tell the user what the consequence is — too old a baseline replays changes the application already has, producing conflicts on code that is already correct; too new a baseline silently skips changes that were never applied — and work out the real one with them. If the project is in Git, its history usually settles it: find the commit that generated or last upgraded the application and read the field there.
