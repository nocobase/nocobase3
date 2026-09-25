# @nocobase/app-plugin-cli-example

Example plugin that contributes commands to an application's `nocobase` CLI.

It exists to demonstrate one capability, the way the other packages under `packages/examples/` each demonstrate one.
Everything it ships is in `cli/`:

| File                    | Shows                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `cli/greet.ts`          | Arguments, flags, and `--json` output                       |
| `cli/artifact-build.ts` | A nested sub-command, and deferring heavy work into `run()` |
| `cli/index.ts`          | Declaring the topic and command map with `defineCliPlugin`  |

Registered in an application, its commands appear under the `cli-example` topic:

```bash
pnpm nocobase cli-example --help
pnpm nocobase cli-example greet world --loud
pnpm nocobase cli-example greet world --json
pnpm nocobase cli-example artifact build --source-root server/artifacts
```
