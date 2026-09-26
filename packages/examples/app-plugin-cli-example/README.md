# @nocobase/app-plugin-cli-example

Example plugin that contributes commands to an application's `nocobase` CLI.

It exists to demonstrate one capability, the way the other packages under `packages/examples/` each demonstrate one.
Everything it ships is in `cli/`:

| File                    | Shows                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `cli/greet.ts`          | An `AppCommand` with arguments and flags, returning the result `--json` prints              |
| `cli/artifact-build.ts` | A nested development command, an `appPath()` flag, and deferring heavy work into `run()`    |
| `cli/index.ts`          | Declaring `commands` and `devCommands` with `defineCliPlugin`                               |
| `tests/cli.test.ts`     | Testing commands with `bindAppCommand` and `runAppCommand` from `@nocobase/app-cli/testing` |

Registered in an application, its commands appear under the `cli-example` topic:

```bash
pnpm nocobase cli-example --help
pnpm nocobase cli-example greet world --loud
pnpm nocobase cli-example greet world --json
pnpm nocobase cli-example artifact build --source-root server/artifacts
```
