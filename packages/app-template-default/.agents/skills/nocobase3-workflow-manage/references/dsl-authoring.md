# DSL Authoring

## Contents

- [Package and imports](#package-and-imports)
- [Complete current example](#complete-current-example)
- [Top-level definition](#top-level-definition)
- [Context Schema](#context-schema)
- [Administrator inputs](#administrator-inputs)
- [Topology and keys](#topology-and-keys)
- [Condition nodes](#condition-nodes)
- [Run nodes and scripts](#run-nodes-and-scripts)
- [Variables and templates](#variables-and-templates)
- [Node result schemas](#node-result-schemas)
- [Validation and compilation](#validation-and-compilation)
- [Error-prevention checklist](#error-prevention-checklist)

## Package and imports

Each direct child directory of the configured workflow source root is one workflow package. The directory name is its stable workflow key. It must contain `workflow.ts` (or a compiled `workflow.js` for loading); package scanning additionally recognizes `workflow.package.yaml` for include/exclude/entry controls and requires one of those workflow entry files.

In the default initialized app, workflow packages are direct children of `server/workflows`, next to `server/workflows/dsl.ts`. Import that application-owned aggregation from a package's `workflow.ts`:

```ts
import { defineWorkflow, node } from '../dsl.js';
```

If the application uses another source root or publishes a stable application package subpath, resolve its aggregation entry before authoring. The aggregation is the discoverable list of node factories available in that application. The default template currently contains `node.condition` and `node.run`. Do not bypass it to guess plugin-private nodes.

## Complete current example

```ts
import { defineWorkflow, node } from '../dsl.js';

export default defineWorkflow({
  title: 'Quotation decision',
  description: 'Calculates a quotation and routes high-value cases.',
  contextSchema: {
    type: 'object',
    required: ['quotationId', 'amount'],
    properties: {
      quotationId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  inputs: {
    approvalLimit: {
      type: 'number',
      title: 'Approval limit',
      default: 100000,
    },
  },
  nodes: [
    node.run({
      key: 'calculateRisk',
      title: 'Calculate risk',
      config: {
        script: './server/calculate-risk.ts',
        args: {
          quotationId: '{{$context.quotationId}}',
          amount: '{{$context.amount}}',
        },
      },
      result: {
        type: 'object',
        required: ['score'],
        properties: { score: { type: 'number' } },
        additionalProperties: false,
      },
    }),
    node
      .condition({
        key: 'needsApproval',
        config: {
          expression: {
            '>': [
              { var: 'nodeResults.calculateRisk.score' },
              { var: 'input.approvalLimit' },
            ],
          },
        },
      })
      .branch({
        yes: [
          node.run({
            key: 'requestApproval',
            config: {
              script: './server/request-approval.ts',
              args: { quotationId: '{{$context.quotationId}}' },
            },
          }),
        ],
        no: [],
      }),
    node.run({
      key: 'recordDecision',
      config: {
        script: './server/record-decision.ts',
        args: { approved: '{{$nodeResults.needsApproval}}' },
      },
    }),
  ],
});
```

The common successor `recordDecision` runs after either branch returns. Empty branches are accepted for readability and omitted from the canonical AST.

## Top-level definition

`defineWorkflow()` accepts:

| Field           | Required | Contract                                                           |
| --------------- | -------: | ------------------------------------------------------------------ |
| `title`         |      yes | string                                                             |
| `description`   |       no | string                                                             |
| `options`       |       no | JSON object; only use fields understood by the runtime/application |
| `inputs`        |       no | administrator scalar parameter declarations                        |
| `contextSchema` |       no | object-root Context Schema; default is `{ type: 'object' }`        |
| `nodes`         |      yes | ordered array of node expressions; may be empty                    |

There is no top-level `trigger`, `start`, node map, or edge list. The default export must be the direct/derived value returned by `defineWorkflow()` and the evaluated AST must be JSON-compatible: no functions, symbols, BigInt, Date, Map, class instances, circular references, or non-finite numbers.

## Context Schema

Context is supplied for each invocation and is persisted in the run. The root schema must have exactly `type: 'object'`. The current implementation accepts this subset:

- Metadata: `$schema` (2020-12 literal), `title`, `description`.
- Types: `null`, `boolean`, `number`, `integer`, `string`, `array`, `object`, including a type array.
- Structure: `properties`, `required`, `additionalProperties`, `items`.
- Values/limits: `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`.

`$ref`, `$dynamicRef`, `format`, and `$async` are explicitly rejected. Do not assume arbitrary JSON Schema keywords are implemented. At runtime, omitted `additionalProperties` behaves as `false`, so declare all accepted fields or explicitly set `true`/a schema. Context must be a JSON object, use finite numbers, and serialize to at most 65,536 UTF-8 bytes.

## Administrator inputs

`inputs` declares deploy-time settings; it is not invocation context. Each key must match `^[A-Za-z_][A-Za-z0-9_]*$` and cannot be `__proto__`, `prototype`, or `constructor`.

Each declaration accepts only:

- `type`: `string`, `number`, or `boolean`.
- Optional string `title` and `description`.
- Optional same-type finite scalar `default`.
- Optional `enum: { label, value }[]` for string/number only.

Enum values must be type-correct and unique; the default must occur in the enum. Boolean enum is invalid. Unknown declaration/option fields are invalid. There is no required marker: a missing override falls back to the DSL default, otherwise the value is absent.

Use an exact template such as `{{$input.approvalLimit}}` or JSON Logic `{ var: 'input.approvalLimit' }`. The key must be declared. `$input` templates cannot use inline defaults or nested paths.

## Topology and keys

- A `nodes` array is a sequential block. Its first node is the block entry; each later node is the preceding node's successor.
- `.branch({ yes: [...], no: [...] })` attaches nested blocks to a branching node. Branch blocks return to the parent and then continue at the parent's next sibling.
- Branch map order has no semantics; keys are normalized in stable order. Node array order is semantic and must not be reordered.
- There is no `.next()`, `.goto()`, `.join()`, `.start()`, callback builder, or arbitrary cycle.
- Every node key across the complete workflow, including all branches, must be globally unique and match `^[A-Za-z_][A-Za-z0-9_-]*$`.
- Node and branch keys cannot be `__proto__`, `prototype`, or `constructor`.
- Keep node keys stable across revisions. Titles/descriptions may change; keys connect history, diagnostics, and result references.
- Only call `.branch()` on a branching node, and only use branch names declared by that instruction contract.

Every node source has `key`, optional `title`/`description`, required `config`, optional `options: { timeout }`, and optional `result`. `timeout` must be a finite positive number. Config is an instruction-owned namespace; never flatten config fields onto the node.

## Condition nodes

`node.condition()` config accepts only optional `expression`. An omitted expression evaluates to `true`. The expression must evaluate to a boolean.

Supported JSON Logic operators are exactly:

`and`, `or`, `!`, `===`, `!==`, `>`, `>=`, `<`, `<=`, `in`, `var`, `startsWith`, `endsWith`.

Variable roots are exactly `context`, `input`, and `nodeResults`. Forbidden property segments are `__proto__`, `prototype`, and `constructor`. Limits are depth 32, total nodes 256, array length 64, and variable path length 256. Operator arity is validated; comparisons use same-type numeric or string ordering. The only branches are `yes` and `no`.

Condition has a built-in boolean result contract. It may therefore be referenced later as `$nodeResults.<conditionKey>` unless explicitly disabled with `result: null`.

## Run nodes and scripts

`node.run()` config accepts only:

```ts
{
  script: string;
  args?: Record<string, JsonValue>;
}
```

`script` is required, non-empty, static, and cannot contain a template. It is resolved from the immutable workflow package artifact; keep it package-relative. `args` is recursively resolved immediately before execution.

The script must provide named export `run`:

```ts
import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

type Args = { quotationId: string };
type Result = { score: number };

export const run: WorkflowRunFunction = async (
  rawArgs,
  runtime,
): Promise<WorkflowRunJsonValue> => {
  const args = rawArgs as Args;
  runtime.signal.throwIfAborted();
  const result: Result = { score: args.quotationId.length };
  runtime.logger.info('Risk calculated');
  return result;
};
```

The actual public function currently receives `args: unknown` and runtime with exactly `app`, `signal`, and `logger`. It returns/awaits an unknown value, but runtime accepts only JSON-storable results. `undefined` becomes `null`; BigInt, functions, symbols, non-finite numbers, circular values, and class instances fail. A return like `{ status: 'failed' }` is ordinary successful business data. Throw to mark execution error. Scripts cannot choose branches, suspend, resume, or drive the processor state machine.

Honor `runtime.signal` in cancellable I/O. Keep secrets out of args/results/logs. Make external side effects idempotent using business identifiers because workflow retries/reruns may call the script again.

## Variables and templates

Run args may contain templates anywhere in JSON-compatible objects/arrays:

- `{{$context.path}}` reads invocation context.
- `{{$input.key}}` reads the resolved administrator setting snapshot.
- `{{$nodeResults.nodeKey.path}}` reads a visible declared upstream result.

An exact template preserves the underlying type. For example `{{$context.amount}}` can become a number. An embedded template such as `Amount: {{$context.amount}}` always becomes a string; `null`/`undefined` interpolate as empty text and objects as JSON text. Bare variable strings like `$context.amount` are also resolved, but explicit braces are clearer in DSL args.

JSON Logic drops the `$` and uses `context.path`, `input.key`, or `nodeResults.nodeKey.path`.

## Node result schemas

`run` has no default result contract. If a later node references its output, declare `result` on the node. `result: null` explicitly disables even an instruction default.

Supported schemas:

- Scalars: `{ type: 'null' | 'boolean' | 'number' | 'integer' | 'string' }`; number/integer/string may have same-type `enum`.
- Array: `{ type: 'array', items: NodeResultSchema }`.
- Object: `{ type: 'object', properties: {...}, required?: string[], additionalProperties?: boolean | NodeResultSchema }`.
- Union: `{ oneOf: NodeResultSchema[] }`, with at least one option and no sibling `type`.
- All forms may have string `title`/`description` and JSON `examples`.

Unknown fields fail. Required object properties must exist in `properties`. A reference path must be legal for the schema; union paths must be valid in every option. Array paths use a numeric index. Closed objects reject undeclared paths; `additionalProperties: true` permits them.

Visibility is lexical and tree-based. A node may reference declared results from earlier nodes in its own block and visible ancestors before entering its branch. It cannot reference itself, later siblings, sibling-branch nodes, or nodes hidden inside an earlier sibling's branch. Runtime output does not expand compile-time visibility.

## Validation and compilation

Run the installed plugin's actual checker before load/build:

```bash
pnpm exec workflow check <package-or-workflow.ts>
```

The checker performs, in order:

1. `typecheck`: strict NodeNext TypeScript with the `source` export condition.
2. `bundle`: esbuild bundles the workflow and imports; authoring imports are redirected to the canonical DSL entry.
3. `evaluate`: a bounded VM evaluates the bundle and requires a valid default AST export.
4. `schema`: Context Schema, inputs, node config, condition expression, and result schemas.
5. `semantic`: registered types, unique/safe keys, branches, declared inputs, and visible result references.
6. `compile`: flat IR topology must have one start, one owner per non-start node, no missing targets, cycles, or unreachable nodes.

`check` does not write the database. Do not publish/load after any issue. Error output contains phase, code, file/line where available, AST path, node key, and contract type; fix the earliest phase first because later phases depend on it.

The default app build path scans each direct workflow package, builds immutable artifacts, and writes them to its configured dist root. Runtime loading materializes new revisions; activation and enablement are separate management concerns.

## Error-prevention checklist

- No legacy YAML, `trigger`, `start`, node map, numeric branch, or edge-list syntax.
- No direct core `condition()`/`run()` imports when an application aggregation entry exists.
- No invented nodes/operators/config fields.
- All objects and evaluated helpers produce JSON-only values.
- Context root is `object`; extra fields are deliberately allowed or rejected.
- Every input reference is declared and has no inline default/nested path.
- Every node key is safe, global, unique, and stable.
- Every branch belongs to the node contract.
- Every run script is static, bundled, named-exported, abort-aware, and idempotent.
- Every referenced run result has an accurate, lexically visible schema.
- The real six-phase checker passes before build/load.
