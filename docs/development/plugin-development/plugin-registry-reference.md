---
title: Plugin Registry 深入参考
description: NocoBase v3 Plugin Registry 的完整字段、工具边界、发布产物、可运行示例和当前限制参考。
---

# Plugin Registry 深入参考

本页用于查询完整字段、工具边界和可运行示例，不是普通 Registry 任务的起点。首先阅读[Registry 模块选择](./registry.md)，再按任务进入[编写 item](./registry-authoring.md)、[构建与安装](./registry-delivery.md)或[升级与移除](./registry-upgrades.md)。

Plugin Registry 是插件发布“可复制、可编辑源码配方”的通用机制。它可以交付页面和组件，也可以交付 Provider、Context、hooks、类型、适配器、工具函数、配置或其他客户端源码。其中，包含页面、组件、表单、布局或交互的 item 属于 UI 类型的 Registry item。

本文以 `@nocobase/app-plugin-registry-example` 为例，记录当前仓库中 Plugin Registry 的实际实现、完整开发和发布流程，以及插件运行时代码、Registry canonical source 和 Template 已安装副本之间的边界。示例以 UI 为主，但 Registry 的定义不等同于 UI，也不等同于 Page。

本文描述的是当前代码已经具备的能力。没有实现的自动安装、版本校验和三方合并能力会明确标记，不把目标设计当成现状。

## 本文范围

本文聚焦 UI 类型的 Registry item。`page-ui`、`component-ui` 和 `provider-ui` 都包含 UI 相关客户端源码，但使用方式不同：页面可以通过 source extension 自动接入，组件需要主动 import，Provider 需要主动包裹 React 子树。未来不包含 UI 的 item 仍可以复用相同的 canonical source、build、publish 和 materialize 流程，只要目标仍属于当前工具支持的客户端源码范围。

## 1. 先说结论

插件代码不要求全部写成 Registry。一个提供可编辑客户端源码的插件通常同时包含运行时代码和 Registry 配方：

| 类型               | 位置                                       | 所有者 | 是否跟随插件升级 | 是否允许应用直接修改          |
| ------------------ | ------------------------------------------ | ------ | ---------------- | ----------------------------- |
| 插件运行时 UI      | `packages/app-plugin-*/client/**`          | 插件   | 是               | 否                            |
| 插件 Registry 配方 | `packages/app-plugin-*/registry/<item>/**` | 插件   | 是               | 否，这是上游 canonical source |
| Registry 安装副本  | `<app>/client/extensions/<name>/**`        | 应用   | 否               | 是                            |
| 应用基础 shadcn UI | `<app>/client/components/ui/**`            | 应用   | 否               | 是                            |

核心原则是：

- 插件必须能够独立运行。默认页面、必要 fallback 和业务协议放在插件运行时代码中。
- 需要交给应用修改的页面、组件、Provider、hooks、适配器或其他源码可以发布为 Registry。
- Registry 只通过插件的稳定公开入口调用插件能力，不复制安全、数据、权限等内核逻辑。
- Registry 安装后成为应用源码。升级插件不会自动覆盖应用已经修改的副本。
- 对包含 UI 的 Registry item，插件和应用各自按需持有 shadcn 源码，不存在全局唯一的 `Button` 实例，也不再依赖统一的 `@nocobase/ui`。

当前 `scripts/registry.mjs` 仍有明确的实现范围：canonical source 必须位于插件的 `registry/` 下，安装目标必须位于应用的 `client/extensions/` 下。因此当前工具主要交付客户端源码，不负责复制服务端路由、Migration 或数据库配置。Plugin Registry 的概念可以继续扩展，但本文不会把尚未实现的服务端安装能力当成现状。

本文统一使用 `@nocobase/app-plugin-registry-example` 作为示例：

```text
@nocobase/app-plugin-registry-example
├── client/default-pages/             插件可独立运行的默认页面
├── client/components/ui/             插件自己的 shadcn 基础组件
├── client/route-contracts.ts         Registry 可依赖的稳定 route ID
├── registry/page-ui/                 完整页面和路由覆盖
├── registry/component-ui/            可直接 import 的组件
├── registry/provider-ui/             Provider、Context 和 hook
├── registry.config.json              三个 item 的元数据和文件映射
└── public/r/                          build 生成的 shadcn JSON，不提交 Git

@nocobase/app-template-default
├── client/components/ui/             应用自己的 shadcn 基础组件
└── client/extensions/
    ├── nocobase-registry-example-page-ui/
    ├── nocobase-registry-example-component-ui/
    └── nocobase-registry-example-provider-ui/
                                       已安装、由应用拥有的源码
```

## 2. 完整数据流

```text
插件作者维护
registry/<item> + registry.config.json
             │
             ├── pnpm registry materialize
             │          │
             │          └── 直接复制到 App/client/extensions/<name>
             │              适合 monorepo 预装，不需要先 build
             │
             └── pnpm registry build
                        │
                        └── public/r/<item>.json
                                   │
                                   ├── npm 包携带该产物
                                   └── Registry/CDN 以 HTTP 暴露
                                              │
                                              └── shadcn add
                                                    │
                                                    ├── 安装 dependencies
                                                    ├── 解析 registryDependencies
                                                    └── 写入 App/client/extensions/<name>
```

应用启动后，Default Template 通过下面的 glob 自动发现扩展：

```ts
import.meta.glob('./extensions/*/extension.ts', { eager: true });
```

因此 Default Template 当前要求自动加载入口使用精确文件名：

```text
client/extensions/<name>/extension.ts
```

安装文件本身不会自动注册或启用插件。插件仍需单独出现在应用的 `package.json`：

```json
{
  "devDependencies": {
    "@nocobase/app-plugin-registry-example": "workspace:^"
  },
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-registry-example": {
        "enabled": true
      }
    }
  }
}
```

仓库内使用：

```bash
pnpm plugin:register registry-example --app app-template-default
```

Registry 的 `meta.nocobase.requiresPlugins` 目前只是供人和未来工具读取的描述性元数据，当前 `registry.mjs` 和 shadcn CLI 都不会据此启用插件或强制校验版本。

## 3. 什么内容应该放 Registry

适合放 Registry 的客户端源码：

- 可直接 import 的组件、hooks、类型和工具函数；
- Provider、Context、适配器和客户端配置；
- Dialog、Drawer、表单、字段和其他不依赖路由的 UI；
- 登录页、注册页等最终页面组合；
- Logo、品牌、营销文案和主题表现；
- 应用通常需要二次修改的表单布局和字段组合；
- 可复用的页面区块、Demo、Prompt generator；
- 通过稳定插件 API 获取数据或触发动作的 UI；
- 应用级 route component override、Provider 或其他 source extension 贡献。

不适合放 Registry 的内容：

- Session、Token 和安全校验；
- 数据库、Migration、ACL、队列和服务端 API；
- 插件必须依赖才能正常工作的唯一默认 UI；
- 插件私有状态机和未承诺兼容的内部模块；
- 用户不应该修改的协议实现；
- 为了复用而把整个插件前端复制到应用的代码。

判断标准不是“代码是不是 React”或“是不是 UI”，而是“这段源码升级时应该由插件强制提供，还是安装后应该由应用接管”。

Registry item 也不等于页面目录。`registry/<item>` 应该按它实际交付的 API 自然组织：页面类 item 可以继续使用 `pages/`，组件类 item 可以直接导出组件，Provider 类 item 可以包含 Context、Provider 和 hooks。`extension.ts` 同样是可选的：需要自动贡献路由覆盖等应用扩展时才提供；只交付可直接 import 的组件或 Provider 时可以完全没有它。

示例插件把三种常见边界分别展示出来：

- 插件拥有 `/registry-example`、稳定 route ID 和 fallback 页面；
- `page-ui` 拥有可编辑页面，安装后的 `extension.ts` 只覆盖插件路由的 `componentLoader`，不重复声明路由；
- `component-ui` 只提供可直接 import 的 `EditablePanel`，不需要页面和自动加载入口；
- `provider-ui` 只提供 `ExampleUiProvider`、Context 和 hook，由应用决定包裹范围；
- 后两个 item 虽然由插件发布，但安装后不依赖该插件运行。

## 4. 插件内部使用 shadcn

插件本身需要的基础组件按需生成到插件目录：

```bash
cd packages/app-plugin-registry-example
pnpm exec shadcn add button
```

对应的 `components.json` 使用插件自己的 alias：

```json
{
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

这个 `components.json` 服务于插件运行时源码的 `shadcn add`，不是 `registry build` 的输入。`registry build` 只读取 `registry.config.json`、`package.json` 和 `registry/<item>` 源码。

插件的 `tsconfig.json` 再把 `@/*` 指向插件的 `client/*`。例如插件内部写：

```ts
import { Button } from '@/components/ui/button';
```

这里指向插件自己的 `client/components/ui/button.tsx`。它不会指向 Template，也不会通过 alias 动态切换到应用的 Button。

Registry 源码中同样可以写：

```ts
import { Button } from '@/components/ui/button';
```

但 Registry 被安装到应用后，这个 alias 由应用的 `components.json` 和 TypeScript/Vite 配置解释，最终指向应用自己的 `client/components/ui/button.tsx`。

因此 Registry 一般不复制插件的 `client/components/ui`。它通过 `registryDependencies` 声明 `button`、`input` 等组件，由远程 shadcn add 把这些 primitives 安装到消费应用；使用仓库 `materialize` 时则由调用方提前准备。

所以插件运行时 Button 和应用 Button 是两份源码。这是刻意的所有权隔离：

- 插件升级可以安全升级插件自己的组件；
- 应用可以自由修改应用自己的组件；
- 两边不会因为修改一个共享组件而互相破坏。

代价是可能存在少量重复代码和 bundle 内容。对于小型 shadcn primitives，这个代价通常小于建立全局 UI ABI 带来的版本和定制冲突。

## 5. 在插件中创建 Registry item

以下以 `@nocobase/app-plugin-registry-example` 的三个 item 为例。

### 5.1 创建 canonical source

源码放在插件自己的 Registry 目录，并按交付 API 自然组织：

```text
packages/app-plugin-registry-example/registry/
├── page-ui/
│   ├── README.md
│   ├── extension.ts
│   └── pages/registry-example-page.tsx
├── component-ui/
│   ├── README.md
│   ├── editable-panel.tsx
│   └── index.ts
└── provider-ui/
    ├── README.md
    ├── example-ui-context.ts
    ├── example-ui-provider.tsx
    └── index.ts
```

约束：

- 相对 import 必须留在当前 Registry item 根目录内；
- 对插件能力的 import 必须使用稳定、公开的 package export；
- 对应用基础 UI 和应用服务的 import 使用 `@/`；
- 不要 import 插件内部的 fallback 页面或未导出的私有文件；
- 只有需要自动贡献 route override 等能力时才提供 `extension.ts`；
- 需要应用直接 import 的 item 应通过 `index.ts` 暴露清晰入口；
- item 内提供 README，说明所有权、编辑入口和升级策略。

三个 item 的运行方式不同：

| Item           | 是否有 `pages/` | 是否有 `extension.ts` | 安装后如何使用                      |
| -------------- | --------------- | --------------------- | ----------------------------------- |
| `page-ui`      | 是              | 是                    | 自动覆盖插件已有路由的页面组件      |
| `component-ui` | 否              | 否                    | 应用直接 import `EditablePanel`     |
| `provider-ui`  | 否              | 否                    | 应用接入 Provider，再通过 hook 使用 |

### 5.2 在 package.json 声明 Registry

推荐声明 canonical item 路径：

```json
{
  "files": ["dist", "registry", "registry.config.json", "public/r"],
  "nocobase": {
    "registry": {
      "items": {
        "component-ui": "./registry/component-ui",
        "page-ui": "./registry/page-ui",
        "provider-ui": "./registry/provider-ui"
      }
    }
  }
}
```

当前构建工具在 `nocobase.registry.items` 存在时会校验 item 路径是否与 `registry.config.json` 一致。这个字段在代码层面仍是可选的，但插件 Registry 应按约定始终声明，方便发现和未来工具处理。

### 5.3 编写 registry.config.json

示例插件的配置包含三个独立 item。下面保留与边界最相关的字段：

```json
{
  "name": "nocobase-registry-example",
  "homepage": "https://www.nocobase.com",
  "items": [
    {
      "name": "page-ui",
      "type": "registry:block",
      "title": "NocoBase Plugin Registry Page Example",
      "dependencies": [
        "@nocobase/app-client@^1.0.0-beta.1",
        "@nocobase/app-plugin-registry-example@^0.0.1"
      ],
      "registryDependencies": ["button"],
      "meta": {
        "ownership": "application",
        "upgradePolicy": "three-way-merge",
        "nocobase": {
          "requiresPlugins": {
            "@nocobase/app-plugin-registry-example": ">=0.0.1 <0.1.0"
          }
        }
      },
      "source": {
        "root": "registry/page-ui",
        "target": "client/extensions/nocobase-registry-example-page-ui",
        "include": ["."]
      }
    },
    {
      "name": "component-ui",
      "type": "registry:component",
      "dependencies": [],
      "registryDependencies": ["button"],
      "meta": {
        "ownership": "application",
        "upgradePolicy": "three-way-merge"
      },
      "source": {
        "root": "registry/component-ui",
        "target": "client/extensions/nocobase-registry-example-component-ui",
        "include": ["."]
      }
    },
    {
      "name": "provider-ui",
      "type": "registry:component",
      "dependencies": [],
      "registryDependencies": [],
      "meta": {
        "ownership": "application",
        "upgradePolicy": "three-way-merge"
      },
      "source": {
        "root": "registry/provider-ui",
        "target": "client/extensions/nocobase-registry-example-provider-ui",
        "include": ["."]
      }
    }
  ]
}
```

字段职责：

| 字段                   | 当前作用                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `name`                 | Registry item 名称，也是 `<name>.json` 文件名              |
| `type`                 | shadcn item 类型，如 `registry:block` 或 `registry:lib`    |
| `dependencies`         | 远程 `shadcn add` 时需要加入消费应用的 npm 依赖            |
| `registryDependencies` | 远程 `shadcn add` 时递归安装的 shadcn 或命名 Registry item |
| `docs`                 | 给使用者和 Agent 的安装说明                                |
| `meta`                 | NocoBase 自定义元数据；目前不自动执行                      |
| `source.root`          | canonical source；必须位于 `registry/` 下                  |
| `source.target`        | 应用安装目录；必须位于 `client/extensions/` 下             |
| `source.include`       | 从 source root 选入 item 的文件或目录；`.` 表示全部        |

`source.package` 是可选高级字段，可以让一个 workspace package 从另一个 package 的 `registry/` 目录取 canonical source。插件自行发布自己的 Registry 时应省略该字段，让源码、配置和产物留在同一个插件包中。

`dependencies` 和兼容版本目前需要手动维护。构建工具不会根据插件 `package.json` 自动同步版本。

如果源码 import 了 `@nocobase/app-portal-sdk`，当前工具会额外要求 `dependencies` 中存在带版本的 `@nocobase/app-portal-sdk@...`。其他依赖暂时没有同等级别的 import 扫描校验。

### 5.4 添加包内命令和发布钩子

```json
{
  "scripts": {
    "registry:build": "node ../../scripts/registry.mjs build --package .",
    "registry:materialize": "node ../../scripts/registry.mjs materialize --package .",
    "prepack": "pnpm registry:build",
    "check": "pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm registry:build && pnpm build"
  }
}
```

`prepack` 很重要，因为 `public/r/` 是生成目录并被 `.gitignore` 忽略。npm 打包前必须重新生成，否则 tarball 中可能没有 Registry JSON 或带着过期产物。

只有显式选择下面的 capability 时，`plugin:create` 才会生成 Registry 结构：

```bash
pnpm plugin:create feature-card --with registry
```

`registry` capability 会生成两类相互独立的基础结构：

- 插件运行时 UI 使用的 `components.json`、`client/styles.css` 和 `@/*`
  TypeScript alias，因此可以直接在插件目录运行
  `pnpm exec shadcn add <component>`；
- 一个最小的 `registry/component-ui` canonical source、
  `registry.config.json`、`nocobase.registry.items` 声明以及 Registry build、
  materialize 和 prepack scripts。

生成器只预置一个不会自动改变应用行为的组件类 item，用来建立完整的源码所有权、
shadcn 依赖、构建和发布链路。需要页面覆盖、Provider 或多个 item 时，再根据插件实际
交付边界扩展配置。不需要可编辑源码时不要选择 `registry`，生成结果也不会包含
`registry/`、`registry.config.json`、对应 package 字段、依赖和 scripts。

## 6. 构建 Registry 发布产物

在仓库根目录构建指定插件：

```bash
pnpm registry build \
  --package @nocobase/app-plugin-registry-example
```

也可以在插件目录执行包内命令：

```bash
cd packages/app-plugin-registry-example
pnpm registry:build
```

只构建一个 item：

```bash
pnpm registry build \
  --package @nocobase/app-plugin-registry-example \
  --item component-ui
```

构建所有带 `registry.config.json` 的 workspace package：

```bash
pnpm registry build --all
```

完整构建会先清理 owner package 的 `public/r`，再生成：

```text
public/r/
├── registry.json
├── page-ui.json
├── component-ui.json
└── provider-ui.json
```

- `registry.json` 是 item 索引，文件条目不包含源码内容；
- 三个 `<item>.json` 都是独立可安装 item，`files[].content` 内嵌完整源码；
- 自定义的 `source` 字段不会进入最终 shadcn item；
- 每个源文件会变成带 `path`、`target`、`type` 和 `content` 的 `registry:file`。

只构建 `--item` 时不会清理其他 item JSON，但会把 `registry.json` 重写为只包含本次选中的 item。因此多 item package 发布前应该运行一次不带 `--item` 的完整构建。

### 是否需要 build 才能安装

分两种情况：

| 安装方式                           | 是否需要先 build | 原因                                        |
| ---------------------------------- | ---------------- | ------------------------------------------- |
| 仓库内 `pnpm registry materialize` | 不需要           | 直接读取 `registry/<item>` canonical source |
| 远程 `shadcn add`                  | 需要             | 消费的是 `public/r/<item>.json`             |

## 7. 发布插件和 Registry JSON

插件的 `package.json.files` 同时包含：

```json
["dist", "registry", "registry.config.json", "public/r"]
```

因此 npm tarball 会携带：

- 插件运行时构建产物；
- Registry canonical source；
- Registry 配置；
- 已构建的 shadcn JSON。

但必须注意：

> 发布 npm 包不等于已经发布了可供 shadcn CLI 访问的 Registry URL。

shadcn CLI 需要 HTTP(S) 地址。发布流程还需要把包内的 `public/r/*.json` 暴露到静态站点、对象存储或 CDN，例如：

```text
https://registry.example.com/registry-example/r/component-ui.json
```

当前仓库已经实现 JSON 生成和 npm 打包，但没有在 `scripts/registry.mjs` 中实现上传 CDN、生成官方域名或从 npm 包自动启动 Registry 服务。部署 Registry HTTP 地址属于发布基础设施的下一环。

## 8. 在 Template 中安装

当前有两种方式。

### 8.1 monorepo 内 materialize

例如，把可直接 import 的组件物化到 Default Template：

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-registry-example \
  --item component-ui \
  --output-root packages/app-template-default
```

结果：

```text
packages/app-template-default/
└── client/extensions/nocobase-registry-example-component-ui/
```

当前 `materialize` 的行为非常克制：

- 直接复制 canonical source；
- 不读取构建后的 `public/r/*.json`；
- 不安装 `dependencies`；
- 不安装 `registryDependencies`；
- 不注册或启用所需插件；
- 不检查 `meta.nocobase.requiresPlugins`；
- 目标目录只要已经存在就拒绝执行；
- 不提供 `--overwrite`；
- 不记录已安装版本或源文件 hash。

因此 materialize 前需要由调用方先准备依赖：

1. 如果 item 声明了插件依赖，先注册并安装插件；
2. 确保应用 `package.json` 已有 Registry 声明的 npm 依赖；
3. 在应用目录按需执行 shadcn add，准备 `button` 等基础组件；
4. 确认目标 `client/extensions/<name>` 不存在；
5. 执行 materialize；
6. 运行应用 lint、typecheck、test 和 build。

示例插件不会默认注册或物化到 Default Template。仓库测试使用临时应用目录验证三个 item 的 build 和 materialize，不改变默认应用行为。

### 8.2 远程 shadcn add

如果 Registry JSON 已经有可访问地址，可以直接安装：

```bash
cd packages/app-template-default
pnpm exec shadcn add \
  https://registry.example.com/registry-example/r/component-ui.json
```

或者在消费应用 `components.json` 中配置命名 Registry：

```json
{
  "registries": {
    "@nocobase-registry-example": "https://registry.example.com/registry-example/r/{name}.json"
  }
}
```

然后执行：

```bash
pnpm exec shadcn add @nocobase-registry-example/component-ui
```

远程 shadcn add 与仓库 `materialize` 的主要区别是，它会按照 Registry item 处理 npm `dependencies` 和 `registryDependencies`，并根据每个文件的 `target` 写入应用目录。

当前 Default Template 的 `components.json` 中有一个开发用的 `@nocobase` 地址：

```json
{
  "registries": {
    "@nocobase": "http://localhost:5173/r/{name}.json"
  }
}
```

这只是本地 Registry URL 约定，不会自动把任意已安装插件的 `node_modules/<plugin>/public/r` 映射到 Vite 的 `/r`。使用插件 Registry 前仍需要明确由哪个本地服务或发布站点提供 JSON。

## 9. 安装后的加载和定制

安装后的扩展不从插件包运行，而是作为应用源码参与应用的 TypeScript、Vite 和 Tailwind 构建。

`page-ui` 的 `extension.ts` 调用：

```ts
defineClientSourceExtension({
  name: 'nocobase-registry-example-page-ui',
  routeComponentOverrides: [
    {
      routeId: REGISTRY_EXAMPLE_ROUTE_IDS.index,
      componentLoader: () => import('./pages/registry-example-page'),
    },
  ],
});
```

只有带 `extension.ts` 的 item 会被 Default Template 自动发现。三个示例安装后的使用方式不同：

- `page-ui`：自动覆盖 `/registry-example` 的页面组件，应用可以修改 `pages/registry-example-page.tsx`；
- `component-ui`：不会自动执行，应用从其 `index.ts` import `EditablePanel`；
- `provider-ui`：不会自动包裹应用，应用从其 `index.ts` import `ExampleUiProvider` 和 `useExampleUi`，自行决定 Provider 范围。

应用修改这些安装文件不会改变插件包内的 canonical source。修改 `page-ui` 也不会改变插件自己的 fallback 页面。

## 10. 升级流程

当前没有自动 Registry upgrade 命令，也没有安装 lockfile。升级应理解为三份源码的合并：

```text
旧版本插件 Registry canonical source   作为 merge base
应用当前 client/extensions 副本         包含用户修改
新版本插件 Registry canonical source   包含上游更新
```

推荐流程：

1. 升级插件依赖，但不要覆盖 `client/extensions/<name>`；
2. 获取旧版本和新版本的 Registry canonical source；
3. 比较上游两个版本，确认插件公开 API、依赖和 UI 变化；
4. 以旧版本为 base，将新版本变化合并到应用副本；
5. 保留应用的品牌、字段、布局和业务定制；
6. 检查 `registryDependencies` 是否增加了新的 shadcn 基础组件；
7. 检查 `dependencies` 和 `requiresPlugins` 兼容范围；
8. 运行应用完整验证。

不要直接执行：

```bash
pnpm exec shadcn add --overwrite <registry-item>
```

除非明确接受丢失应用修改。仓库的 `materialize` 会直接拒绝已有目标，正是为了避免无意覆盖。

升级插件本身不会自动升级已安装 Registry source。这种解耦是当前设计的核心，而不是缺陷：插件内核可以持续升级，应用是否采纳新版配方由应用决定。

## 11. 删除流程

删除已安装 Registry item 时：

1. 删除对应的 `client/extensions/<name>`；
2. 删除只被该扩展使用的应用依赖和 shadcn primitives；
3. 对 `page-ui` 这类覆盖项，保留插件时会恢复使用插件自己的默认或 fallback UI；
4. 如果插件也不再需要，再执行 `plugin:unregister`；
5. 运行应用 typecheck、test 和 build。

当前没有 `registry remove` 命令，也没有依赖引用计数，所以第 2 步需要人工确认，不能机械删除共享依赖。

## 12. 开发和验证清单

修改插件 Registry 后至少执行：

```bash
pnpm registry build \
  --package @nocobase/app-plugin-registry-example

pnpm --filter @nocobase/app-plugin-registry-example lint
pnpm --filter @nocobase/app-plugin-registry-example typecheck
pnpm --filter @nocobase/app-plugin-registry-example test
pnpm --filter @nocobase/app-plugin-registry-example registry:build
pnpm --filter @nocobase/app-plugin-registry-example build
```

然后在一个消费应用中物化或安装，再执行：

```bash
pnpm --filter @nocobase/app-template-default lint
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```

只有 Registry item 实际形成 Client contribution，而且需要诊断 composition 时，才额外运行 `client:inspect`。它不是 Registry build、materialize 或消费端验证的默认步骤。

示例插件的 ESLint 和 declaration build 会忽略 `registry/**`，因为 Registry source 使用消费应用的 `@/` alias，不能作为插件 declaration build 的一部分编译。仓库脚本测试会把三个 item 物化到临时应用目录并验证文件、target 和关键 import；对于正式 Registry，还应在真实消费应用中执行 typecheck 和 build。仅执行插件自身 typecheck 不能证明安装后的 Registry source 可用。

仓库级 Registry 脚本测试：

```bash
pnpm scripts:test
```

它当前覆盖：

- package selector 和命令参数解析；
- JSON 内嵌源码构建；
- canonical source 到应用 target 的复制；
- 已有 target 的覆盖保护；
- 示例插件三个 item 的 JSON 构建；
- `page-ui`、`component-ui`、`provider-ui` 到各自 target 的临时应用物化；
- `page-ui` 的 route ID 引用，以及 `component-ui`、`provider-ui` 的直接导出入口。

## 13. 最小可运行示例

仓库提供了一个专门展示上述边界的示例包：

```text
packages/app-plugin-registry-example/
├── client/
│   ├── components/ui/button.tsx        插件自己的 shadcn Button
│   ├── default-pages/                   插件可独立运行的 fallback 页面
│   ├── route-contracts.ts               给 Registry 使用的稳定 route ID
│   └── routes.ts                        /registry-example 路由
├── registry/page-ui/
│   ├── pages/                            完整页面
│   └── extension.ts                     把页面挂到稳定 route ID
├── registry/component-ui/
│   ├── editable-panel.tsx                可直接 import 的组件
│   └── index.ts                          组件公开入口
├── registry/provider-ui/
│   ├── example-ui-context.ts             Context 和 hook
│   ├── example-ui-provider.tsx           Provider
│   └── index.ts                          Provider 公开入口
├── registry.config.json
└── public/r/                             build 生成，不提交 Git
```

这三个 item 参考了未迁移的旧 Registry：

- `page-ui` 类似 `nocobase-users-example`，包含完整页面和路由集成；
- `component-ui` 类似 `nocobase-client`、`nocobase-file-upload`，安装后由应用直接 import；
- `provider-ui` 类似 `nocobase-i18n`，提供 Context、Provider 和 hook，不声明页面或路由。

只有 `page-ui` 使用 `pages/` 和 `extension.ts`。另外两个 item 保持它们自然的源码结构，不为了统一目录而伪装成 Page 或 Template。`page-ui` 和插件 fallback 页面也刻意各自持有 Button：前者使用应用的 `@/components/ui/button`，后者使用插件自己的 shadcn Button。

示例插件不会默认注册到 `app-template-default`，因此不会给默认应用增加路由。要在应用中实际体验，先单独注册插件：

```bash
pnpm plugin:register registry-example --app app-template-default
```

插件注册和 Registry item 安装是两个独立动作。只注册插件时，访问 `/registry-example` 会看到插件 fallback 页面；再准备应用的 shadcn `button` 并物化 `page-ui` item：

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-registry-example \
  --item page-ui \
  --output-root packages/app-template-default
```

应用重新构建后，同一路由会由 `client/extensions/nocobase-registry-example-page-ui` 中的可编辑页面接管。其他 item 可以独立安装：

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-registry-example \
  --item component-ui \
  --output-root packages/app-template-default

pnpm registry materialize \
  --package @nocobase/app-plugin-registry-example \
  --item provider-ui \
  --output-root packages/app-template-default
```

安装后，应用从对应目录的 `index.ts` 直接引用 `EditablePanel` 或 `ExampleUiProvider`。Registry 构建和发布产物可以单独验证：

```bash
pnpm --filter @nocobase/app-plugin-registry-example registry:build
```

包内 [README](../../../packages/app-plugin-registry-example/README.md) 记录了 build、materialize、远程 `shadcn add` 和升级合并流程。

## 14. 当前能力和缺口

### 已实现

- 每个插件独立拥有 canonical Registry source；
- `registry.config.json` 到 shadcn schema JSON 的构建；
- item 源码内容内嵌；
- package、item 和全 workspace 构建；
- monorepo 内 materialize；
- 安装 target 路径和 source 路径安全限制；
- 已有 target 拒绝覆盖；
- Portal SDK 版本依赖的最低限度检查；
- `prepack` 生成 npm 包内 Registry 产物；
- `plugin:create --with registry` 生成最小可扩展 Registry 结构；
- Default Template 自动发现 `client/extensions/*/extension.ts`。

### 尚未实现

- 插件 Registry 的统一官方 HTTP/CDN 发布流程；
- 根据 npm 包自动挂载 `public/r` 的本地 Registry server；
- `materialize` 自动安装 npm dependencies 和 registryDependencies；
- `materialize` 自动注册或启用所需插件；
- `requiresPlugins` 和版本范围强制校验；
- Registry 安装记录、版本、hash 或 lockfile；
- 自动 update、remove 和三方合并；
- 对所有源码 import 和 `dependencies` 的完整一致性检查；
- 每个非预安装 Registry 的独立消费端编译 fixture。

## 15. 推荐的当前工作方式

在现阶段，推荐把流程固定为：

1. 插件先提供稳定运行时能力和 fallback UI；
2. 需要交给应用修改的客户端源码才放 `plugin/registry/<item>`；
3. Registry 只依赖插件稳定 exports 和应用 `@/` alias；
4. monorepo 默认模板使用 `materialize` 预装；
5. 对外发布执行 `registry build`，再由独立 Registry/CDN 暴露 JSON；
6. 安装后的代码归应用所有；
7. 插件升级和 Registry item 升级分开；
8. Registry item 升级始终走显式 review 和三方合并。

这套方式保留了 shadcn “源码交付、允许修改”的优势，同时把插件必须稳定运行的内核留在插件包中。页面、组件和 Provider 等 UI 类型 item 都按相同的源码所有权原则处理；未来不包含 UI 的 Registry item 也应保持同样的安装后应用所有权边界：

> 插件负责能力和可运行默认值，Registry 负责可编辑配方，Template 负责最终应用源码和定制结果。
