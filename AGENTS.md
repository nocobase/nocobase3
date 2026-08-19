# AGENTS.md

## 类库开发的 TypeScript 要求

凡是会产出 `.d.ts` 的包（`declaration: true`），tsconfig 都已开启 `isolatedDeclarations: true` 和 `isolatedModules: true`。当前覆盖：

| 配置 | 说明 |
| --- | --- |
| `packages/portal-sdk/tsconfig.json` | SDK 主体 |
| `packages/database/tsconfig.json` | 数据库包 |
| `packages/app-host/tsconfig.json` | 应用宿主 |
| `packages/app-template-default/tsconfig.server.json` | 模板服务端 |
| `packages/hub/tsconfig.server.json` | Hub 服务端 |

在这些范围内写代码时，导出的 API 必须能脱离类型推断、单看这一个文件就生成声明，因此要遵守下面几条。

### 所有导出都要显式标注类型

- 导出的函数、方法、getter 一律写明返回类型，包括箭头函数。
- 有默认值的参数要写类型，`name = getDefault()` 应写成 `name: string = getDefault()`。
- 导出的 `const` 要写类型，尤其是 `createContext(...)`、`new SomeClass()` 这类由调用结果推断出来的值：`export const client: NocoBaseClient = new NocoBaseClient();`。
- 返回匿名对象的函数，把返回结构提成具名的导出类型再引用，不要依赖结构推断。项目里的 `RouteSurfaceState`、`AppExtensionContributions`、`UseGetRolesResult` 就是这么来的。

### 不允许用逃逸手段绕过

不要用 `as any`、`@ts-ignore`、`@ts-expect-error` 来消除 `isolatedDeclarations` 报错，也不要为了让类型通过而放宽成 `any` / `unknown`。报错说明这个导出的类型契约没写清楚，正确做法是补上准确的标注。

标注要贴合运行时的真实行为，不能为了让编译通过而写一个更宽或更窄的类型。举两个项目里的实际例子：`resolveAclDataSourceKey` 会走到 `return undefined`，所以类型是 `string | undefined` 而不是 `string`；`NocoBaseClient.stream()` 内部对 `!response.body` 已经 throw，非空收窄成立，所以返回 `Promise<ReadableStream<Uint8Array>>` 而不是带 `| null`。标注错了会直接传导成下游包的编译错误。

### 改动后的验证

至少要跑通对应包的 `pnpm typecheck` 和 `pnpm build`；改 `portal-sdk` 时还要跑 `app-template-default` 和 `hub` 的 typecheck，因为它们的 `exports` 直接指向 SDK 源码，SDK 的类型标注会立刻影响下游。

## 其他

- 应用侧的 client 代码（`app-template-default` / `hub` 的 `tsconfig.json`、`tsconfig.node.json`）是 `noEmit`，只开了 `isolatedModules`，不受上面 `isolatedDeclarations` 的约束。
