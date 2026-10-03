---
title: '工作流定义 DSL'
description: '用类型化 builder 定义工作流的输入、管理员参数、节点顺序、条件分支和自定义表单。'
keywords: 'NocoBase,Workflow DSL,workflow,defineHandler,TypeBox,parameters'
---

# 工作流定义 DSL

本页是审阅 Agent 生成代码时的参考。工作流通常由应用 Agent 编写，你不需要记住这里的细节；精确的编写规则以工作流插件随包发布的 Skill 为准。

NocoBase 3 用 TypeScript 的类型化 builder 描述工作流。定义只表达可版本化的流程结构：输入、参数、节点顺序和分支；计算、查询、写入和外部调用都放在处理函数中，由处理函数调用应用的 Service。

## 工作流包

应用从 `workflows/` 读取工作流，每个直接子目录是一个工作流包：

```text
workflows/quotation-routing/
├── workflow.ts              # 定义入口，默认导出 finalize() 的结果
├── server/                  # Run 和 Condition 节点的处理函数
│   ├── calculate.ts
│   ├── needs-review.ts
│   └── record-route.ts
└── client/                  # 可选：输入和参数的自定义表单
    └── parametersForm.tsx
```

目录名是工作流的 key，业务代码用它触发工作流，应保持稳定；标题和说明可以随时调整。

## 完整示例

下面的报价路由工作流包含输入、管理员参数、Run 节点、带两个分支的 Condition 节点，以及分支后的共同后继。`examples` 模板中的 `workflows/example-quotation-routing/` 是一个可以直接运行的同类示例。

```ts
// workflows/quotation-routing/workflow.ts
import {
  createConditionInstruction,
  createRunInstruction,
  defineHandler,
  Type,
  workflow,
  type ContextOf,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

import type { run as calculate } from './server/calculate';
import type { run as needsReview } from './server/needs-review';
import type { run as recordRoute } from './server/record-route';

const flow = workflow({
  key: 'quotation-routing',
  title: '报价路由',
  description: '计算报价金额，按管理员设置的阈值选择人工跟进或标准处理。',
  input: {
    schema: Type.Object(
      {
        quotationId: Type.String({ title: '报价编号', minLength: 1 }),
        amountCents: Type.Integer({ title: '金额（分）', minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  parameters: {
    schema: Type.Object(
      {
        reviewThresholdCents: Type.Number({
          title: '人工跟进阈值（分）',
          default: 100000,
        }),
      },
      { additionalProperties: false },
    ),
  },
})
  .addNode(
    createRunInstruction({
      key: 'calculate',
      title: '计算报价',
      description: '校验报价输入，返回报价编号和以分为单位的总额。',
    }).run(defineHandler<typeof calculate>('./server/calculate')),
  )
  .addNode(
    createConditionInstruction({
      key: 'needsFollowUp',
      title: '是否达到人工跟进阈值',
      description: '比较报价总额与阈值：达到时进入人工跟进，否则进入标准处理。',
    })
      .check(defineHandler<typeof needsReview>('./server/needs-review'))
      .yes([
        createRunInstruction({
          key: 'manualFollowUp',
          title: '标记人工跟进',
          description: '记录人工跟进的分类结果，不修改订单。',
        }).run(defineHandler<typeof recordRoute>('./server/record-route')),
      ])
      .no([
        createRunInstruction({
          key: 'standardRouting',
          title: '标准处理',
          description: '记录标准处理的分类结果，不修改订单。',
        }).run(defineHandler<typeof recordRoute>('./server/record-route')),
      ]),
  );

// 供处理函数引用的共享上下文类型，需逐项声明
export interface FlowContext {
  input: ContextOf<typeof flow>['input'];
  parameters: ContextOf<typeof flow>['parameters'];
  nodeResults: ContextOf<typeof flow>['nodeResults'];
}

const definition: WorkflowSourceAst = flow.finalize();
export default definition;
```

对应的处理函数：

```ts
// workflows/quotation-routing/server/calculate.ts
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { FlowContext } from '../workflow';

export function run(
  { input }: FlowContext,
  options: WorkflowRunOptions,
): { quotationId: string; totalCents: number } {
  options.signal.throwIfAborted();
  return { quotationId: input.quotationId, totalCents: input.amountCents };
}
```

```ts
// workflows/quotation-routing/server/needs-review.ts
import type { FlowContext } from '../workflow';

export function run({ nodeResults, parameters }: FlowContext): boolean {
  const calculated = nodeResults.calculate;
  return (
    calculated !== undefined &&
    calculated.totalCents >= parameters.reviewThresholdCents
  );
}
```

要点：

- 节点不声明参数映射，也不声明结果 Schema。每个处理函数从上下文读取 `input`、`parameters` 和 `nodeResults`，节点结果的类型由处理函数的返回类型推导；
- 定义文件用 `import type` 引入处理函数的签名，再用 `defineHandler<typeof run>('<模块路径>')` 声明。这样检查和加载定义时不会执行服务端代码，模块路径和类型导入必须指向同一个文件；
- 默认导出 `flow.finalize()` 的结果，而不是 builder 本身。

## 顶层定义

`workflow()` 接受：

| 字段          | 是否必需 | 用途                                                     |
| ------------- | -------- | -------------------------------------------------------- |
| `key`         | 是       | 工作流包的目录名，必须与目录名一致                       |
| `title`       | 是       | 管理界面显示的名称                                       |
| `description` | 否       | 向管理员说明业务目的；修改流程时可附上最近一次变更的说明 |
| `input`       | 否       | `{ schema, form? }`，每次触发的输入；省略时为任意对象    |
| `parameters`  | 否       | `{ schema, form? }`，管理员可调整的参数                  |
| `inputSchema` | 否       | 没有自定义表单时 `input: { schema }` 的简写              |
| `options`     | 否       | 版本级的执行设置，见下文                                 |

没有 `trigger`、`start`、节点 Map 或连线列表：触发方式在定义之外决定，见[触发与扩展 API](./service-api.md)。

`options` 目前支持：

- `timeout`：整体超时，单位秒，`0` 或省略表示不限制；
- `stackLimit`：在嵌套调用链中本工作流最多出现的次数，默认 `1`，`0` 表示拒绝嵌套调用。

这些设置属于已发布的版本，不是输入，也不是管理员参数。

## 输入

输入随每次触发变化，例如报价编号和金额，会作为快照保存在运行记录中。推荐用插件导出的 `Type`（TypeBox）声明，处理函数可以获得精确的类型；也可以直接写 JSON Schema，此时处理函数只能得到通用类型。

根节点必须是 `object`，支持的 JSON Schema 子集：

- 类型：`null`、`boolean`、`number`、`integer`、`string`、`array`、`object`；
- 结构：`properties`、`required`、`additionalProperties`、`items`；
- 取值与限制：`enum`、`const`、数值上下限、字符串和数组长度；
- 元数据：`$schema`、`title`、`description`。

不支持 `$ref`、`$dynamicRef`、`format` 和 `$async`。省略 `additionalProperties` 时按不允许额外字段处理。输入必须是 JSON 对象，序列化后不超过 65,536 字节。推荐传业务 ID，不要传完整的模型、文件或秘密。

## 管理员参数

参数是部署后由管理员调整的少量配置，例如风险阈值。它和输入一样在运行开始时形成快照，之后修改设置不影响已开始的运行。

`parameters.schema` 是一个对象 Schema，每个属性只允许：

- `type`：`string`、`number` 或 `boolean`；
- `title`、`description`；
- 与类型一致的 `default`；
- `enum`（仅字符串和数字）：值的数组，值不能重复，默认值必须在其中。

```ts
parameters: {
  schema: Type.Object(
    {
      strategy: Type.String({
        title: '评估策略',
        default: 'standard',
        enum: ['standard', 'conservative'],
      }),
    },
    { additionalProperties: false },
  ),
},
```

默认参数界面直接用枚举值作为选项名称。需要显示“标准”“保守”这样的名称时，提供[自定义参数表单](#自定义输入和参数表单)。

参数没有“必填”：管理员未设置时使用默认值，没有默认值时该值缺失。不要把凭证放进参数或输入，API 密钥应由应用配置提供。

## 自定义输入和参数表单

默认表单只适合顶层的字符串和数字字段。需要布尔开关、复杂输入或更友好的说明时，在 `input` 或 `parameters` 中指定 `form`：

```ts
parameters: {
  schema: Type.Object({ /* ... */ }),
  form: './client/parametersForm.tsx',
},
```

- 路径相对于工作流包，必须位于 `client/` 目录下；
- 模块默认导出一个 React 组件，接收 `WorkflowParameterFormProps`（从 `@nocobase/app-plugin-workflow/client` 导入），包括 `schema`、`value`、`defaults`、`disabled` 和 `onChange`；
- 表单随版本一起构建，之后修改表单不会改变已发布版本的显示方式；
- 表单依赖的组件应放在工作流包内，使产物自包含。

`examples` 模板的 `example-quotation-routing` 包含输入表单和参数表单的完整示例。

## 顺序和分支

- 连续调用 `addNode()` 表示顺序。builder 不可变：`addNode()` 返回包含新节点的 builder，必须链式调用或保留返回值；丢弃返回值后对原 builder 调用 `finalize()` 会报错并列出被遗漏的节点；
- Condition 用 `.yes([...])` 和 `.no([...])` 声明两个分支，可以省略其中一个或两个；也可以写 `.branch({ yes: [...], no: [...] })`；
- 分支走完后继续执行 Condition 之后的同级节点，即两个分支的共同后继；
- 不支持 `goto`、通用汇合、循环或跨分支连线。

各节点的用法见[节点概览](./nodes/index.md)。

## 处理函数与共享上下文

- 处理函数导出名为 `run` 的函数。第一个参数是上下文 `{ input, parameters, nodeResults }`，第二个参数提供 `services`、`signal` 和 `logger`，见 [Run 节点](./nodes/run.md)；
- 在 `workflow.ts` 中用 `ContextOf<typeof flow>` **逐项**声明 `FlowContext`（如上例）。不要写成 `type FlowContext = ContextOf<typeof flow>`，否则可能形成类型推导循环；
- 引用 `FlowContext` 的处理函数应显式声明返回类型，理由同上；
- `nodeResults` 包含整个工作流中所有节点的结果类型，包括分支内的节点，但每个结果都可能是 `undefined`：类型检查不保证执行顺序，也不保证某个分支确实执行过，读取前必须判断；
- `finalize()` 会检查每个处理函数需要的上下文是否与工作流一致。

## 节点 key 和说明

- 节点 key 在整个工作流内全局唯一（包括分支），符合 `^[A-Za-z_][A-Za-z0-9_-]*$`，不能是 `__proto__`、`prototype` 或 `constructor`；
- 业务含义不变时保持 key 稳定，历史诊断和结果都通过 key 关联；
- 每个节点都应有具体的 `description`，说明它的业务目的、实际逻辑和副作用。管理员在流程图中点击节点时看到的就是它。Condition 的说明应讲清判断规则和两个分支分别做什么。

## 定义必须是确定的

`workflow.ts` 在检查和构建时执行，结果会参与版本摘要计算。定义中：

- 只能出现 JSON 兼容值，不能有函数、Date、Map、类实例、BigInt 或循环引用；
- 不要使用 `Date.now()`、随机数、当前时区、机器绝对路径、环境变量分支或网络调用；
- 会变化的业务数据放进处理函数、输入或管理员参数。

## 旧写法

早期版本使用 `defineWorkflow()` 加 `RunInstruction.create({ config: { module, args }, result })`，通过 `{{$input.x}}` 这样的模板给节点传参。这套底层 API 仍然可用，但新代码应使用 builder。原来的 JSON Logic 条件表达式已经移除，必须改写为返回布尔值的处理函数。迁移提示词见[提示词手册](../development/using-skill.md#迁移旧写法)。

## 常见问题

### 为什么处理函数里读到的节点结果可能是 undefined

类型只描述“这个节点可能产生什么结果”，不描述它是否已经执行。上游节点在另一个分支中，或者流程提前结束时，结果都不存在。

### 为什么不能在定义里值导入处理函数

值导入会在检查和加载定义时执行处理函数及其依赖，例如数据库客户端。定义只需要函数签名，所以用 `import type`，运行时再按模块路径加载。

### 为什么某些 JSON Schema 关键字不可用

工作流只实现了一个受控子集，以本页列表和工作流 Skill 为准。
