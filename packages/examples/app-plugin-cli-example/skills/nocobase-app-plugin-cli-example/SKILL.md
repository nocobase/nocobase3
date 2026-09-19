---
name: nocobase-app-plugin-cli-example
description: Use when adding commands to an application's nocobase CLI, or when working out how a plugin contributes CLI commands. Covers the ./cli entry, defineCliPlugin, and how topics are assembled.
---

# CLI Example Plugin

This plugin contributes commands to the application's `nocobase` CLI. Read it as the reference implementation when
writing commands for another plugin.

## What a CLI plugin is

A plugin contributes commands by exporting a `./cli` entry. The application lists that entry in `cli/plugins.ts`, and
`pnpm nocobase` assembles it into one command tree alongside the built-in `plugin *` commands and the application's own
`app *` commands.

Commands are static: they operate on files and packages. They do not start the application, connect to the database, or
resolve services from the container.

## The three pieces

**A command** is an oclif `Command` subclass — the same shape the built-in commands use:

```ts
// cli/greet.ts
import { Args, Command, Flags } from '@oclif/core';

export default class Greet extends Command {
  static override summary = 'Print a greeting.';
  static override examples = ['<%= config.bin %> <%= command.id %> world'];
  static override args = {
    target: Args.string({ description: 'Who to greet.', required: true }),
  };
  static override flags = {
    loud: Flags.boolean({ default: false, description: 'Upper-case it.' }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Greet);
    this.log(
      flags.loud
        ? `HELLO, ${args.target.toUpperCase()}!`
        : `Hello, ${args.target}.`,
    );
  }
}
```

**The entry** declares the topic and the command map:

```ts
// cli/index.ts
import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';
import Greet from './greet.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-cli-example',
  topic: 'demo',
  description: 'Example commands contributed by a plugin.',
  commands: { greet: Greet, 'artifact:build': ArtifactBuild },
});

export default cliPlugin;
```

Keys are sub-command names. `greet` becomes `nocobase demo greet`; the colon in `artifact:build` nests one level
further, into `nocobase demo artifact build`.

**The manifest** exposes the entry and declares oclif:

```json
{
  "exports": {
    "./cli": { "types": "./cli/index.ts", "import": "./cli/index.ts" }
  },
  "publishConfig": {
    "exports": {
      "./cli": {
        "types": "./dist/cli/index.d.ts",
        "import": "./dist/cli/index.js"
      }
    }
  },
  "peerDependencies": { "@oclif/core": "^4.14.0" },
  "devDependencies": { "@oclif/core": "catalog:" }
}
```

`@oclif/core` is a peer so the plugin and the application share one copy, which is what keeps help rendering and flag
parsing consistent. A peer range is published metadata resolved in an installation that is not this workspace, so it
cannot be `catalog:`; the devDependency is what pins the version used here.

`cli/` must reach consumers — through `files`, or through `dist` as here.

## Rules that matter

**Topics are one flat namespace.** `plugin` belongs to the built-in commands and `app` to the application. Every plugin
claims one more. A collision fails at startup naming both claimants rather than resolving silently.

**Keep command modules cheap to import.** The application imports every registered plugin's `./cli` entry to build
`--help`. A class declaration costs nothing; load anything expensive inside `run()` with `await import()`, as
`cli/artifact-build.ts` does.

**Follow the output conventions.** `--json` writes one machine-readable result to stdout on success and to stderr on
failure, preserving a non-zero exit code. Exit codes are `0` success, `1` runtime error, `2` argument error.

## Verify

```bash
pnpm nocobase demo --help              # the topic and its commands
pnpm nocobase demo greet --help        # one command's flags and args
pnpm nocobase demo greet world --json
```

A command missing from `--help` usually means the plugin is absent from the application's `cli/plugins.ts`. Run
`pnpm plugin:inspect <name> --json` and read `composition.cli`.
