---
title: CLI 命令与构建钩子
description: 插件如何向 App 的命令行贡献命令，以及如何注册 pnpm build 和 pnpm dev 要执行的命令。
---

# CLI 命令与构建钩子

插件可以往 App 的 `pnpm nocobase` 里加命令，也可以要求 App 在构建或 dev 启动的某个时点执行一条命令。两件事都在同一个入口里声明。

这一页只讲插件侧要写什么。命令树怎么装配、topic 冲突怎么报错、App 侧 `cli/index.ts` 长什么样，在 [插件 CLI](../../cli/plugin-cli.md)。

## 什么时候需要

**命令**——插件有一件事需要人或 CI 主动去做，而它不需要 App 跑起来：校验源码态的声明文件、生成产物、检视插件自己的静态状态。需要读运行时状态的能力不走这里，那是 Server 路由或 Job。

**构建钩子**——插件必须先产出点什么，App 才跑得起来。源码态工作流是典型：`server/workflows/` 下的 `.ts` 要先编译成 Artifact，服务端才加载得了，所以 `pnpm build` 和 `pnpm dev` 都得先跑一遍编译。

## 加一个 `cli/` 入口

与 `./server`、`./client` 对称，插件多一个 `cli/` 目录和一个 `exports['./cli']`。

命令是 oclif `Command` 子类，写法和内置命令完全一致：

```ts
// cli/greet.ts
import { Args, Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

export default class DemoGreet extends Command {
  static override summary = 'Print a greeting.';

  static override args: {
    target: Interfaces.Arg<string, Interfaces.CustomOptions>;
  } = {
    target: Args.string({ description: 'Who to greet.', required: true }),
  };

  static override flags: { json: Interfaces.BooleanFlag<boolean> } = {
    json: Flags.boolean({ default: false, description: 'Print one machine-readable JSON result.' }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(DemoGreet);
    if (flags.json) {
      this.logJson({ ok: true, target: args.target });
      return;
    }
    this.log(`Hello, ${args.target}.`);
  }
}
```

`args` 和 `flags` 上那些类型标注是必须的：插件包要产出 `.d.ts`，`isolatedDeclarations` 不允许从初始值反推。标每个 flag 的具体类型（`BooleanFlag<boolean>`），不要标笼统的 `Interfaces.FlagInput`——后者能过编译，但会让 `this.parse()` 的返回值退化成 `any`。

命令模块要重依赖时在 `run()` 里 `await import()`，这样 `--help` 不会把它们拉起来。

## 入口声明

```ts
// cli/index.ts
import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import DemoGreet from './greet.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-demo',
  topic: 'demo',
  description: 'Demo commands.',
  commands: { greet: DemoGreet },
});

export default cliPlugin;
```

命令 key 就是子命令名：`greet` → `nocobase demo greet`。嵌套写 `'artifact:build'` → `nocobase demo artifact build`。

`topic` 全局唯一，撞名（包括撞上 `plugin`、`app`）会让 `pnpm nocobase` 直接报错退出，消息里点名是哪两个插件撞了哪个 topic。

## 注册构建钩子

钩子和命令在同一个声明里：

```ts
const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-workflow',
  topic: 'workflow',
  commands: { check: WorkflowCheck, build: WorkflowBuild },
  buildHooks: {
    afterServerBuild: [
      {
        label: 'Build workflow artifacts',
        command: [
          'pnpm', 'nocobase', 'workflow', 'build',
          '--resource-root', './dist/server/workflows',
        ],
      },
    ],
  },
});
```

workflow 插件只声明了 `buildHooks`。dev 阶段的钩子写法一样：

```ts
  devHooks: {
    beforeDev: [
      { label: 'Prepare demo artifacts', command: ['pnpm', 'nocobase', 'demo', 'build'] },
    ],
  },
```

workflow 不挂这个，是因为非生产运行时下 loader 会按需编译 `server/workflows`，产出的 digest 跟构建产出的一致——再加一次预编译只会给每次 `pnpm dev` 启动加上几秒，不会让任何原本看不见的东西变得可见。

`command` 是拆好的数组。不过 shell，所以带空格的参数不用管引号，跨平台行为也一致；反过来 `&&`、管道、重定向、`FOO=1` 前缀都不成立——要顺序执行就声明多个钩子，别的自己包一条命令。数组第 0 位是任意可执行文件，不限于 `pnpm`：`['node', './scripts/x.mjs']` 也行，不必为了用钩子而先包一条 oclif 命令。

`label` 可选，是构建日志里那行 `> ...`；不给就拿命令本身顶上。

插件可以只挂钩子、完全不贡献命令，这时 `commands` 整个省掉。

### 挑哪个阶段

阶段名说的是**钩子跑的时候有什么**，不是哪一步产出的它：

| 阶段               | 此时 `dist` 里有什么        |
| ------------------ | --------------------------- |
| `beforeBuild`      | 空目录（`dist` 刚被清空）   |
| `afterClientBuild` | `dist/client`               |
| `afterServerBuild` | `+ dist/server`             |
| `afterBuild`       | 完整产物，含 `node_modules` |

按钩子需要读什么来挑。workflow 的构建钩子挂 `afterServerBuild`，是因为 `--resource-root` 要读 `tsc` 刚编译出来的 `.js`；dev 没有编译产物、直接读源码，所以 `beforeDev` 那条不传 resource root。

dev 只有 `beforeDev`：构建是一串会结束的步骤，而 `pnpm dev` 起的是并发常驻进程，`afterClientDev` 指向一个不存在的时刻。

阶段名写错会当场抛错。少跑一个钩子和正常跑完看起来一模一样——插件加载成功、构建成功、那一步只是没发生，而最早发现它的地方通常是部署之后。

同阶段多个钩子按声明顺序执行，任一失败即中止，工作目录是 App 根目录。

App 那边可以先看这次构建会多做什么：

```bash
pnpm nocobase plugin cli-hooks
```

## package.json

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
  "peerDependencies": { "@oclif/core": "^4.14.0" }
}
```

`@oclif/core` 走 peer 而不是 dependency：让插件和 App 用同一个 oclif 大版本，help 渲染和 flag 解析行为才一致，也避免每个插件各拖一份副本。peer 是发布出去的契约，装它的人不在本仓库的 workspace 里，所以写明确的版本范围而不是 `catalog:`。只声明这一处就够了，pnpm 会把它 link 进插件自己的 `node_modules`。

`cli/` 要进 `files`（或经由 `dist`），否则装到 App 里没有这个入口。

## 注册到 App

`pnpm plugin:register` 会自动把插件加进 App 的 `cli/plugins.ts`，判据是插件有没有 `exports['./cli']`。数组顺序即贡献顺序，也是同阶段钩子的执行顺序。

## 相关

- [插件 CLI](../../cli/plugin-cli.md)：命令树装配、App 侧入口、部署产物里怎么跑命令
- [插件注册（workspace）](./plugin-registration-workspace.md)：`plugin:register` 维护哪些组合根
