# @nocobase/app-plugin-scheduled-workflow-example

Default application test automation scheduled every five minutes.

## Schedule

The plugin contributes `scheduled-test-workflow-every-5-minutes`, which invokes
the default application's `scheduled-test-workflow` workflow every five minutes
in the `Asia/Singapore` timezone.

Run `pnpm --filter @nocobase/app-template-default scheduler:sync` to synchronize
the code-owned definition into an initialized application database.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-scheduled-workflow-example lint
pnpm --filter @nocobase/app-plugin-scheduled-workflow-example typecheck
pnpm --filter @nocobase/app-plugin-scheduled-workflow-example test
pnpm --filter @nocobase/app-plugin-scheduled-workflow-example build
```
