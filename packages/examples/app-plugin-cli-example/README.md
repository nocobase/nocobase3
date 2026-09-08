# @nocobase/app-plugin-cli-example

Example plugin that contributes commands to an application's `nocobase` CLI.

It exists to demonstrate one capability, the way the other packages under `packages/examples/` each demonstrate one.
Everything it ships is in `cli/`:

| File                    | Shows                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `cli/greet.ts`          | Arguments, flags, and `--json` output                       |
| `cli/artifact-build.ts` | A nested sub-command, and deferring heavy work into `run()` |
| `cli/index.ts`          | Declaring the topic and command map with `defineCliPlugin`  |

Registered in an application, its commands appear under the `demo` topic:

```bash
pnpm nocobase demo --help
pnpm nocobase demo greet world --loud
pnpm nocobase demo greet world --json
pnpm nocobase demo artifact build --source-root server/artifacts
```

See [internal-docs/cli/plugin-cli.md](../../../internal-docs/cli/plugin-cli.md) for the full contract.
