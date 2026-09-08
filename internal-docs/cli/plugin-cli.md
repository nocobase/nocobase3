# 插件 CLI

App 有一条自己的命令行入口 `pnpm nocobase`。它把三样东西装进同一棵命令树：内置的插件管理命令、App 自己写的命令、以及各个插件贡献的命令。

```bash
pnpm nocobase --help                # 看全部命令
pnpm nocobase plugin register file  # 内置：插件管理
pnpm nocobase app seed-demo         # App 自己的命令
pnpm nocobase demo greet --name Ana # 插件贡献的命令
```

命令是纯静态的：它们只操作文件和包，不启动 App，不连数据库，不解析 ServiceContainer。需要读运行时状态的能力不走这里。

## 命令树

顶层被三类东西瓜分，插件用一个自己声明的 topic 占位：

| 位置              | 来源                            | 例子                      |
| ----------------- | ------------------------------- | ------------------------- |
| `plugin *`        | `@nocobase/nb3-cli` 内置        | `nocobase plugin register` |
| `app *`           | App 的 `cli/commands/`          | `nocobase app seed-demo`  |
| 插件声明的 topic  | 插件的 `exports['./cli']`       | `nocobase demo greet`     |

topic 全局唯一。插件之间撞名，或者撞上 `plugin`、`app`，`pnpm nocobase` 启动时直接报错退出，消息里点名是哪两个插件撞了哪个 topic——不静默覆盖，也不自动改名。

## 插件侧：写一条命令

插件新增一个 `cli/` 目录和一个 `exports['./cli']` 入口，与 `./server`、`./client` 对称。

### 命令实现

一条命令是一个 oclif `Command` 子类，与 `nb3-cli` 内置命令写法完全一致：

```ts
// cli/greet.ts
import { Args, Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

export default class DemoGreet extends Command {
  static override summary = 'Print a greeting.';
  static override description =
    'Demonstrates flags, args, and JSON output in a plugin-contributed command.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> world',
    '<%= config.bin %> <%= command.id %> world --loud --json',
  ];

  static override args: {
    target: Interfaces.Arg<string, Interfaces.CustomOptions>;
  } = {
    target: Args.string({ description: 'Who to greet.', required: true }),
  };

  static override flags: {
    loud: Interfaces.BooleanFlag<boolean>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    loud: Flags.boolean({ default: false, description: 'Upper-case the greeting.' }),
    json: Flags.boolean({ default: false, description: 'Print one machine-readable JSON result.' }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(DemoGreet);
    const message = flags.loud ? `HELLO, ${args.target.toUpperCase()}!` : `Hello, ${args.target}.`;

    if (flags.json) {
      this.logJson({ ok: true, message });
      return;
    }
    this.log(message);
  }
}
```

`<%= config.bin %>` 是 oclif 模板变量，会渲染成实际的 bin 名，examples 不用写死 `nocobase`。

`examples`、`args`、`flags` 上那几个类型标注是必须的：插件包会产出 `.d.ts`，`isolatedDeclarations` 不允许从初始值反推导出类型。注意标的是每个 flag 的具体类型（`BooleanFlag<boolean>` 之类）而不是笼统的 `Interfaces.FlagInput`——后者虽然也能过编译，但会让 `this.parse()` 的返回值退化成 `any`。

命令模块要重依赖时自己在 `run()` 里 `await import()`，这样 `--help` 不会把它们拉起来。这是开发者自己的判断，机制不做限制。

### CLI 入口

入口用 `defineCliPlugin` 声明 topic 和命令清单，命令是静态 import 进来的：

```ts
// cli/index.ts
import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import DemoGreet from './greet.ts';
import DemoInspect from './inspect.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-cli-example',
  topic: 'demo',
  description: 'Demo commands contributed by the CLI example plugin.',
  commands: {
    greet: DemoGreet,
    inspect: DemoInspect,
  },
});

export default cliPlugin;
```

命令 key 就是子命令名：`greet` → `nocobase demo greet`。嵌套写成 `'artifact:build'` → `nocobase demo artifact build`。

### package.json

```json
{
  "exports": {
    "./cli": { "types": "./cli/index.ts", "import": "./cli/index.ts" }
  },
  "publishConfig": {
    "exports": {
      "./cli": { "types": "./dist/cli/index.d.ts", "import": "./dist/cli/index.js" }
    }
  },
  "peerDependencies": { "@oclif/core": "^4.14.0" },
  "devDependencies": { "@oclif/core": "catalog:" }
}
```

`@oclif/core` 走 peer 而不是 dependency：让插件和 App 用同一个 oclif 大版本，help 渲染和 flag 解析行为才一致，也避免每个插件各拖一份副本。peer 是发布出去的契约，装它的人不在本仓库的 workspace 里，所以不能写 `catalog:`；devDependency 才写 `catalog:`，把开发时的版本钉在仓库统一的那个上。

`cli/` 要进 `files`（或经由 `dist`），否则装到 App 里没有这个入口。

## App 侧：加载

App 有一个 `cli/` 目录，与 `client/`、`server/` 并列：

```text
cli/index.ts             组装入口，pnpm nocobase 执行的就是它
cli/plugins.ts           插件 CLI 贡献列表
cli/commands/index.ts    App 自己的命令清单，key 就是 app topic 下的命令名
cli/commands/*.ts        命令实现，随 dist 一起发布
cli/dev-commands/        只在开发态存在的命令，不进 dist
```

### cli/plugins.ts

与 `server/plugins.ts` 同构，数组顺序即贡献顺序，删掉条目和 import 就等于关掉那个插件的命令：

```ts
import { defineCliPlugins, type AppCliPlugins } from '@nocobase/nb3-cli/plugins';
import cliExample from '@nocobase/app-plugin-cli-example/cli';

const cliPlugins: AppCliPlugins = defineCliPlugins([cliExample]);

export default cliPlugins;
```

这个文件由 `pnpm plugin:register` 自动维护，跟 `client/plugins.ts` 和 `server/plugins.ts` 一样。判据是插件有没有 `exports['./cli']`：没有就跳过并说明跳过了。App 没装 TypeScript 时，注册照常完成，只把要加的两行原样打印出来。

### cli/index.ts

```ts
#!/usr/bin/env node
import { runAppCli } from '@nocobase/nb3-cli/runtime';

import appCommands from './commands/index.ts';
import cliPlugins from './plugins.ts';

await runAppCli({
  commands: appCommands,
  plugins: cliPlugins,
});
```

### package.json

```json
{
  "scripts": {
    "nocobase": "tsx ./cli/index.ts",
    "migrate": "pnpm nocobase app migrate",
    "seed": "pnpm nocobase app seed"
  }
}
```

`migrate` 和 `seed` 这类脚本名保持不变——它们是人和 CI 已经在敲的——只是背后从各自一个脚本文件改成了统一走命令，实现只剩一份。注意要写 `pnpm nocobase`：PATH 上的 `nocobase` 是包自带的 bin，只有内置命令，App 自己的命令在 `cli/index.ts` 里。

`cli/` 跟 `server/` 一起被 `tsconfig.server.json` 编译进 `dist`，所以 import 兄弟文件写 `.js` 后缀，不是 `.ts`。

**部署产物里也能跑命令。** `dist/package.json` 会带上 `"nocobase": "node ./cli/index.js"`，`dist/cli/` 是编译产物，`@nocobase/nb3-cli`、`@oclif/core` 和贡献命令的插件都会进部署依赖树：

```bash
cd dist && node ./cli/index.js demo greet world
```

### 只在开发态存在的命令

有些命令天然进不了部署产物——比如读取 Client 声明要用 Vite 和浏览器端代码，而服务器产物里两者都没有。这类命令放 `cli/dev-commands/`，`tsconfig.server.json` 的 `exclude` 把它排除掉，`cli/index.ts` 只在源码模式下加载它们：

```ts
const runningFromSource = import.meta.filename.endsWith('.ts');
const devCommands: AppCliCommands = runningFromSource
  ? (await import(`${'./dev-commands'}/index.js`)).default
  : {};
```

那个拼接出来的 specifier 是刻意的：写成字面量的话，TypeScript 会跟着它把 `dev-commands` 拉进 server 编译,`exclude` 也拦不住。

这样 `dist` 里的 `--help` 干脆不列这些命令，而不是列出来一跑就崩。

## 执行

```bash
pnpm nocobase --help                     # 全部 topic 和命令
pnpm nocobase demo --help                # 某个插件贡献了什么
pnpm nocobase demo greet --help          # 单条命令的 flags 和 args
pnpm nocobase demo greet world --loud
pnpm nocobase demo greet world --json    # 机器可读输出
```

约定与内置命令一致：`--json` 成功写 stdout、失败写 stderr 并保留非零退出码；退出码 `0` 成功、`1` 运行错误、`2` 参数错误。

## 与 client/server 的关系

CLI 是 App 的第四个显式组合根，与前三个平级：

| 组合根              | 装什么           | 谁维护                    |
| ------------------- | ---------------- | ------------------------- |
| `client/plugins.ts` | 前端插件         | `pnpm plugin:register`    |
| `server/plugins.ts` | 服务端插件       | `pnpm plugin:register`    |
| `cli/plugins.ts`    | 插件命令         | `pnpm plugin:register`    |
| `nocobase.plugins`  | 启用状态与版本   | `pnpm plugin:register`    |

一个插件可以只贡献其中任意几项。三个入口互不依赖：纯 CLI 插件不需要 `./server`，纯服务端插件也不会被写进 `cli/plugins.ts`。
