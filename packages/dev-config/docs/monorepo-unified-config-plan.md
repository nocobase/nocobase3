---
title: NocoBase 3 Monorepo 统一配置方案
date: 2026-08-20
tags:
  - NocoBase
  - monorepo
  - engineering
  - tooling
status: implemented
---

# NocoBase 3 Monorepo 统一配置方案

> [!abstract] 结论
> 新建公开、可独立安装但暂不发布的 ESM package：`@nocobase/dev-config`。它统一 TypeScript、ESLint、Prettier、Vitest 与 Portal Vite 基线；各 package 通过继承或组合使用，并保留路径、入口、环境变量等本地差异。依赖版本由 pnpm catalog 管理，根目录补齐 Husky、lint-staged、GitHub Actions 与发布前检查。

> [!success] 实施状态
> 方案已在 `feat-unify-monorepo-config` 分支实现。TypeScript 6 typecheck、ESLint 10、Vitest 4 全量测试、全量 build、pnpm peer 检查以及 pack/publint/ATTW 检查均已通过；未执行 npm publish。

## 1. 背景与现状

仓库目前有 18 份 tsconfig，能够归纳为浏览器应用、浏览器类库、Node 服务、Node 类库和 Node tooling 等类型。其中多份配置完全重复，但也存在不能错误合并的运行时差异：

- `app-template-default` 与 `hub` 的 client tsconfig 相同。
- 多个 Node 类库 tsconfig 完全相同。
- Portal 的 client、server、Node tooling 和 migrations 必须区分。
- `portal-sdk`、`app-host` 需要 DOM 类型，但又会生成声明文件。
- `database` 有特殊的 `rootDir`、测试编译范围和输出布局。
- `paths`、`include`、`exclude`、`rootDir`、`outDir` 等与消费 package 的目录结构绑定，不能放入发布后的共享 preset。

ESLint 目前只存在于 `app-template-default` 和 `hub`，两份配置基本相同，但把浏览器 globals 与 React 规则同时应用到了 client、server 和测试文件；其他 package 以及 JS/MJS 构建脚本没有覆盖。仓库尚无统一 Prettier、Husky、lint-staged 或 CI 配置。

Vitest、Portal Vite 与 React 测试 setup 也存在明显重复。Playwright 目前只有两个使用者，抽象收益不足，先不纳入。

## 2. 目标

1. 所有现有与未来 package 都能按运行环境选择明确的上游配置。
2. package 可以覆盖共享配置，但差异必须留在本地且容易审查。
3. 所有 package 发布到 npm 后，源码开发者仍能安装 `@nocobase/dev-config` 并独立运行检查与构建。
4. 配置包本身具备稳定 exports、英文文档、语义化版本约束和 pack 校验。
5. 在一个大 PR 中完成全部现有 package 的迁移，不长期保留两套配置。
6. npm 发布流程尚未配置，本次只做到 publish-ready，不执行发布。

## 3. 非目标

- 不抽取 Playwright preset。
- 不统一 Tailwind CSS 文件、Shadcn `components.json`、Docker Compose 等项目结构相关配置。
- 不引入 Changesets、commitlint 或 npm publish workflow。
- 不在首次迁移中全仓格式化历史文件。
- 不额外启用 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride` 等新的 TypeScript 严格选项。
- 不直接继承 `@antfu/eslint-config`、Airbnb、XO 等完整社区 style guide。

## 4. `@nocobase/dev-config` 的定位

package 名称：`@nocobase/dev-config`。

- 公开 package，`publishConfig.access` 为 `public`。
- ESM-only，不维护 CJS 双份产物。
- 只允许作为 devDependency 使用，不进入应用运行时依赖。
- subpath exports 是公开 API，遵循语义化版本。
- 本次不发布到 npm，只通过 `pnpm pack` 验证产物。

建议目录：

```text
packages/dev-config/
├── package.json
├── README.md
├── docs/
│   └── monorepo-unified-config-plan.md
├── tsconfig/
│   ├── README.md
│   ├── base.json
│   ├── client.json
│   ├── client-library.json
│   ├── server.json
│   ├── server-library.json
│   └── node-tooling.json
├── eslint/
│   ├── README.md
│   └── index.js
├── prettier/
│   ├── README.md
│   └── index.js
├── vitest/
│   ├── README.md
│   ├── node.js
│   ├── react.js
│   └── react-setup.js
└── vite/
    ├── README.md
    └── portal.js
```

## 5. TypeScript 统一方案

### 5.1 版本与基础规则

- 全仓统一到 TypeScript 6 的最新兼容版本。
- 版本由 pnpm catalog 固定。
- 暂不使用 TypeScript 7：当前 `typescript-eslint` 只支持 `<6.1.0`。
- 保留当前 `strict` 语义，不顺带增加额外严格规则。
- 所有生成 `.d.ts` 的 library preset 强制 `isolatedDeclarations: true` 和 `isolatedModules: true`，落实根 `AGENTS.md` 已有要求。

### 5.2 Preset 分类

| Preset           | 适用场景             | 关键特征                                               |
| ---------------- | -------------------- | ------------------------------------------------------ |
| `base`           | 所有 TypeScript 项目 | `strict`、通用互操作与检查规则，不包含运行时和目录假设 |
| `client`         | 浏览器/React 应用    | DOM、React JSX、bundler resolution、`noEmit`           |
| `client-library` | 浏览器或 React 类库  | DOM、React JSX、声明输出、isolated declarations        |
| `server`         | Node 服务端应用      | Node types、NodeNext、服务端 emit 基线                 |
| `server-library` | Node 类库            | NodeNext、声明输出、isolated declarations              |
| `node-tooling`   | Vite/Vitest/构建脚本 | Node types、bundler resolution、`noEmit`               |

使用示例：

```json
{
  "extends": "@nocobase/dev-config/tsconfig/client.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./client/*"]
    }
  },
  "include": ["client", "registry"]
}
```

### 5.3 必须留在 package 本地的字段

- `include`、`exclude`
- `paths`、`baseUrl`
- `rootDir`、`outDir`
- `tsBuildInfoFile`
- package 特有的 `types`、入口与 migrations 范围
- 未来可能出现的 project references

这些字段中的相对路径会相对于配置文件解析；放入 npm 配置包可能错误指向 `node_modules/@nocobase/dev-config`。

### 5.4 当前 package 映射

| Package/配置                                     | 上游 preset                | 本地保留内容                                 |
| ------------------------------------------------ | -------------------------- | -------------------------------------------- |
| `app-template-default/tsconfig.json`             | `client`                   | client/registry include、aliases             |
| `hub/tsconfig.json`                              | `client`                   | client/registry include、aliases             |
| `portal-sdk`                                     | `client-library`           | src/test 范围、输出目录                      |
| `app-sdk`                                        | `client-library`           | 浏览器 API、src 范围与输出目录               |
| `app-host`                                       | `server-library` + DOM lib | Node types、src/fixtures/test 范围、输出目录 |
| `authentication`                                 | `server-library` + DOM lib | server/client 入口；UI 由消费端检查          |
| `authorization`                                  | `server-library`           | src 范围与数据库依赖                         |
| Portal `tsconfig.server.json`                    | `server-library`           | 服务端入口、输出、aliases                    |
| Portal `tsconfig.node.json`                      | `node-tooling`             | config/scripts 范围、aliases                 |
| Template migrations                              | 继承本地 server 配置       | 关闭 declaration、单独 include/exclude       |
| `app-server/caching/drive/logging/queue/session` | `server-library`           | src/test 范围与输出目录                      |
| `id-generator`                                   | `client-library`           | isomorphic/browser-safe 源码与输出目录       |
| `database`                                       | `server-library`           | 特殊 rootDir、test include、输出布局         |

## 6. ESLint 统一方案

### 6.1 技术选型

- ESLint 10
- `@eslint/js`
- `typescript-eslint` 8
- `@eslint-react/eslint-plugin`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `@vitest/eslint-plugin`
- `eslint-config-prettier`
- `globals`

选择官方和单领域插件组合，由 NocoBase 自己维护规则。`@antfu/eslint-config` 虽成熟，但默认倾向用 ESLint 负责格式化，与本方案采用独立 Prettier 的决定冲突；Airbnb TypeScript 已归档且停留在 ESLint 8。

### 6.2 Preset 与组合

共享包导出可组合的 flat-config segments/factories：

- `base`
- `typescript`
- `typeChecked`
- `node`
- `react`
- `vitest`

TypeScript 默认采用 `recommendedTypeChecked`，通过 `parserOptions.projectService` 获取类型信息。暂不直接采用更激进且可能频繁变化的 `strictTypeChecked`。

每个 package 保留薄 `eslint.config.js`：

```js
import { createNodeLibraryConfig } from "@nocobase/dev-config/eslint";

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ["generated/**"],
});
```

局部规则和 ignore 可以覆盖，但需要保持最小化，并在非显而易见时说明原因。

### 6.3 覆盖范围

- 纳入 `js`、`mjs`、`cjs`、`ts`、`tsx`。
- React 规则只应用到 client/React 文件。
- Node globals 只应用到 server、tooling 和 Node 测试文件。
- Vitest globals/rules 只应用到测试文件。
- 全局忽略构建产物、coverage、测试产物和生成文件；package 可以追加局部 ignore。
- CI 使用 `--max-warnings=0`，不积累长期 warning。

## 7. Prettier 方案

配置显式声明关键规范，不依赖读者记住默认值：

```js
export default {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
};
```

执行约定：

- `pnpm fix`：先 `eslint --fix`，再 `prettier --write`。
- `pnpm check`：只读执行 ESLint 与 Prettier 检查。
- `format:check` 保留给 CI 和最终验证。
- 首次迁移只强制新增/变更文件，不执行 `prettier --check .`。
- 后续单独完成全仓格式化后，再切换为全量检查。

## 8. Vitest、Vite 与 Playwright

### 8.1 Vitest

- 全仓统一到 Vitest 4。
- 提供 `vitest/node` 与 `vitest/react` 两个 preset/factory。
- React preset 内置当前两份重复 setup：加载 `@testing-library/jest-dom/vitest`，并在 `afterEach` 中执行 Testing Library cleanup。
- aliases、include、coverage provider 与 package 特有环境留在消费端。
- 提供 coverage 基础能力，不设置统一覆盖率阈值。

### 8.2 Portal Vite

提供 `vite/portal` factory，统一：

- React plugin
- Tailwind plugin
- 由 Portal 注入的 SDK compatibility plugin
- 通用 build output、HMR 与开发基线

以下差异由 package 参数或本地 `mergeConfig` 覆盖：

- `base`
- API/代理地址
- `envPrefix`
- aliases
- package 特有插件与环境变量

compatibility plugin 由 Portal 配置从 `@nocobase/portal-sdk/vite` 注入，避免 `dev-config -> portal-sdk -> dev-config` 的 package 循环。

### 8.3 Playwright

暂不抽取。只有两个使用者，且 reporter、webServer、artifact、浏览器项目等配置会与产品测试流程深度绑定。等出现第三个 Portal 或配置明显漂移时再评估。

## 9. pnpm catalog

`pnpm-workspace.yaml` 增加统一 catalog。范围不限于开发工具，也包括重复使用或需要联动升级的关键依赖：

- TypeScript、ESLint、Prettier
- Vitest、Vite 与相关 plugins
- React、React DOM
- Tailwind、`@tailwindcss/vite`
- Testing Library
- Husky、lint-staged
- publint、`@arethetypeswrong/cli`
- 其他在多个 package 中重复出现的核心依赖

必须精确锁步的依赖家族可以使用精确版本。例如 Tiptap 的插件对 `@tiptap/core` 使用精确 peer，因此全家族通过 catalog 固定到同一个 patch，而不是分别使用 caret。

规则：

- catalog 使用 caret 范围，lockfile 固定实际解析版本。
- 内部 package 继续使用 `workspace:`。
- peerDependencies 如果需要比仓库当前版本更宽的兼容范围，可以保留显式范围。
- `pnpm pack`/`pnpm publish` 会自动把 `catalog:` 和 `workspace:` 转成正常版本，不做人工替换。
- CI 检查 pack 后 manifest 不残留 `catalog:` 或 `workspace:`。

## 10. 根目录开发体验

### 10.1 统一 scripts

根目录增加或统一：

```text
lint
lint:fix
format
format:check
check
fix
typecheck
test
build
pack:check
```

各 package 提供可以独立运行的薄 scripts；根目录使用 `pnpm -r --if-present` 编排。

### 10.2 Husky 与 lint-staged

pre-commit hook 只处理 staged 文件：

- JS/TS：先 ESLint `--fix`，再 Prettier `--write`。
- JSON/Markdown/YAML/CSS：Prettier `--write`。
- lint-staged 自动更新暂存内容。
- CI 仍保留只读检查，避免 `--no-verify` 绕过。

### 10.3 `.editorconfig`

根目录新增 `.editorconfig`，至少统一 UTF-8、LF、末尾换行、空格缩进和两空格宽度。它属于仓库编辑器行为，不放入 npm 配置包。

## 11. GitHub Actions

新增基础质量 workflow，触发条件：

- Pull request
- push 到 `develop`

检查内容：

1. 安装 Node 24 与 pnpm 11，启用 pnpm cache。
2. 对变更文件执行 ESLint 与 Prettier 只读检查。
3. 全量执行 typecheck。
4. 全量执行 test。
5. 全量执行 build。
6. 对公开 package 执行 pack/publint/type exports 检查。

不包含 npm token 或 publish job。

## 12. 发布前检查与 Node engine

### 12.1 Publish checks

- `pnpm pack`
- `publint`
- `@arethetypeswrong/cli`
- 检查 tarball 中必要 README、配置 JSON、JS exports 与声明文件是否存在
- 检查发布 manifest 中没有 workspace/catalog 协议

### 12.2 Node engine

- 根仓库继续要求 Node `>=24.0.0`。
- `dev-config`、服务端 package、Hub 与默认模板声明 Node `>=24.0.0`。
- 纯浏览器运行的 SDK 不因为构建工具而增加 Node runtime 限制。
- 根 `AGENTS.md` 指导新 package 根据实际运行环境声明 engines。

## 13. 文档要求

`@nocobase/dev-config` 的文档全部使用英文：

- 根 README：定位、安装、选择矩阵、快速开始、版本策略。
- `tsconfig/README.md`：六类 preset 的选择指南与覆盖示例。
- `eslint/README.md`：环境组合、type-aware lint、本地 ignores/overrides。
- `prettier/README.md`：共享风格、check/write 命令和覆盖方式。
- `vitest/README.md`：Node/React preset、setup 与本地差异。
- `vite/README.md`：Portal factory 参数与覆盖示例。

根 `AGENTS.md` 增加简明路由：新 package 必须先判断运行环境、是否 emit、是否生成声明，再选择上游 preset；默认不得复制整份配置。

## 14. 依赖归属

`@nocobase/dev-config`：

- `dependencies`：配置运行时会直接 import 的 ESLint plugins、共享配置和 `globals`。
- `peerDependencies`：`eslint`、`typescript`、`prettier`、`vitest`、`vite` 等实际 runner。
- React/Vitest/Vite 专项 peers 标记 optional；不用相关 preset 的项目不需要安装。
- `devDependencies`：仅用于配置包自身的测试、lint、typecheck 和 pack 验证。

## 15. 语义化版本策略

- 新增可选 preset：minor。
- 不增加诊断的实现修复：patch。
- 默认规则新增报错、改变 tsconfig 语义、删除或重命名 export：major。
- 所有公开 subpath exports 都视为稳定 API。

## 16. 一个大 PR 的实施顺序

虽然只创建一个 PR，但按下列顺序分组提交和验证：

1. 新建 `@nocobase/dev-config`、exports 与英文文档。
2. 引入 pnpm catalog，统一 TypeScript 6、ESLint 10、Vitest 4 等版本。
3. 迁移 tsconfig，并先跑每个 package 的 typecheck/build。
4. 迁移 ESLint；逐 package 处理 type-aware 诊断。
5. 引入 Prettier、`.editorconfig`、Husky、lint-staged 与统一 fix/check 命令。
6. 迁移 Vitest 与共享 React setup。
7. 抽取 Portal Vite factory。
8. 新增 GitHub Actions 与 pack checks。
9. 全仓验证与文档校对。

## 17. 验证矩阵

| 范围                   | 必跑检查                                              |
| ---------------------- | ----------------------------------------------------- |
| `dev-config`           | lint、tests、exports smoke test、pack/publint         |
| 所有 package           | typecheck、lint、build                                |
| 有测试的 package       | Vitest 4 tests                                        |
| `portal-sdk`           | typecheck/build，并验证模板和 Hub 下游                |
| `app-template-default` | client/node/server/migrations typecheck、tests、build |
| `hub`                  | client/node/server typecheck、tests、build            |
| 声明类库               | `.d.ts` 构建、isolated declarations、ATTW             |
| Portal                 | Vite production build                                 |
| Git hooks              | 临时 staged 文件 smoke test                           |
| CI                     | PR workflow 本地可复现命令                            |

根 `AGENTS.md` 已要求：修改 `portal-sdk` 时额外运行 `app-template-default` 与 `hub` typecheck。该规则继续保留。

## 18. 风险与控制

> [!warning] 主要风险
> TypeScript 6、ESLint 10、type-aware rules、Vitest 4 和共享配置迁移同时发生，诊断量可能较大。必须按 package 分组修复，每完成一组立即运行 typecheck/build/test，避免把问题堆积到最后。

- Type-aware ESLint 性能：使用 `projectService`，避免手写跨 package project globs。
- 相对路径错误：共享 tsconfig 不包含 package 目录字段。
- 配置包未构建导致自举失败：配置入口保持直接可执行的 ESM，pack 前做 exports smoke test。
- Prettier 巨量 diff：只格式化新增/变更文件。
- catalog 发布风险：以实际 tarball manifest 为准进行 CI 检查。
- public API 漂移：subpath exports 和默认规则按语义化版本管理。

## 19. 完成标准

- 所有现有 package 使用共享 tsconfig/ESLint，并能本地覆盖。
- 不再存在整份复制的 Portal ESLint、Vitest、Vite 基础配置。
- TypeScript 统一为 6.x，Vitest 统一为 4.x，ESLint 统一为 10.x。
- 所有关键共享依赖通过 catalog 管理。
- `pnpm fix` 能一步完成 ESLint autofix 与 Prettier write。
- pre-commit 只处理 staged 文件。
- GitHub Actions 能在 PR 和 develop push 上通过。
- 所有公开 package pack/publint/type exports 检查通过。
- `@nocobase/dev-config` 英文文档和根 `AGENTS.md` 选择指引完成。
- npm 未发布，但 tarball 已验证为 publish-ready。
