# DSL Authoring

## Contents

- [Package and imports](#package-and-imports)
- [Complete current example](#complete-current-example)
- [Default application lifecycle](#default-application-lifecycle)
- [Top-level definition](#top-level-definition)
- [Input Schema](#input-schema)
- [Administrator parameters](#administrator-parameters)
- [Topology and keys](#topology-and-keys)
- [Condition nodes](#condition-nodes)
- [Run nodes and scripts](#run-nodes-and-scripts)
- [Variables and templates](#variables-and-templates)
- [Node result schemas](#node-result-schemas)
- [Validation and compilation](#validation-and-compilation)
- [Error-prevention checklist](#error-prevention-checklist)

## Package and imports

Each direct child directory of the configured workflow source root is one workflow package. The directory name is its stable workflow key. In the default application it must contain `workflow.ts`. The low-level package scanner also recognizes `workflow.js`, but the checker, Artifact builder, and default application's build script currently resolve `workflow.ts`; do not offer `workflow.js` as a default-project authoring option.

In the default initialized app, workflow packages are direct children of `server/workflows`. Import the definition helper and registered Instruction classes directly from the workflow plugin:

```ts
import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
} from '@nocobase/app-plugin-workflow';
```

Only use Instruction classes exported by an installed plugin and registered in the target application's build-time and runtime instruction registries. The workflow plugin currently exports `ConditionInstruction` and `RunInstruction`.

## Complete current example

Create all of these files; the DSL alone is not a complete package:

```text
server/workflows/quotation-decision/
├── workflow.ts
└── server/
    ├── calculate-risk.ts
    ├── record-decision.ts
    └── request-approval.ts
```

`workflow.ts`:

```ts
import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
} from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Quotation decision',
  description: 'Calculates a quotation and routes high-value cases.',
  inputSchema: {
    type: 'object',
    required: ['quotationId', 'amount'],
    properties: {
      quotationId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  parameters: {
    approvalLimit: {
      type: 'number',
      title: 'Approval limit',
      default: 100000,
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'calculateRisk',
      title: 'Calculate risk',
      config: {
        script: './server/calculate-risk.ts',
        args: {
          quotationId: '{{$input.quotationId}}',
          amount: '{{$input.amount}}',
        },
      },
      result: {
        type: 'object',
        required: ['score'],
        properties: { score: { type: 'number' } },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'needsApproval',
      config: {
        expression: {
          '>': [
            { var: 'nodeResults.calculateRisk.score' },
            { var: 'parameters.approvalLimit' },
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'requestApproval',
          config: {
            script: './server/request-approval.ts',
            args: { quotationId: '{{$input.quotationId}}' },
          },
        }),
      ],
      no: [],
    }),
    RunInstruction.create({
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

`server/calculate-risk.ts`:

```ts
import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface CalculateRiskArgs {
  quotationId?: unknown;
  amount?: unknown;
}

export const run: WorkflowRunFunction = (
  rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as CalculateRiskArgs;
  if (typeof args.quotationId !== 'string' || typeof args.amount !== 'number') {
    throw new Error('quotationId and amount are required.');
  }
  return { score: args.amount };
};
```

`server/request-approval.ts`:

```ts
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  runtime,
): Promise<null> => {
  runtime.signal.throwIfAborted();
  const quotationId = (rawArgs as { quotationId?: unknown }).quotationId;
  if (typeof quotationId !== 'string')
    throw new Error('quotationId is required.');
  // Call an idempotent application service through runtime.app here.
  runtime.logger.info('Approval requested');
  return null;
};
```

`server/record-decision.ts`:

```ts
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  runtime,
): Promise<null> => {
  runtime.signal.throwIfAborted();
  const needsApproval = (rawArgs as { approved?: unknown }).approved;
  if (typeof needsApproval !== 'boolean')
    throw new Error('approved must be boolean.');
  // Persist by a stable business id; retries may execute this script again.
  runtime.logger.info('Decision recorded');
  return null;
};
```

The comments are intentional integration seams; replace them with application-specific typed service calls. Do not introduce imports outside this Workflow package unless the application's Artifact builder explicitly allowlists the bare package import.

## Default application lifecycle

From `packages/app-template-default` (or the corresponding initialized application root), use this evidence-driven sequence:

1. Create `server/workflows/<stable-key>/workflow.ts` and every referenced run script.
2. Check the DSL source:

   ```bash
   pnpm exec workflow check server/workflows/<stable-key>
   ```

   Expect `Workflow check passed: ... (<n> nodes)`. This is only the six-phase DSL/IR check described below.

3. Build the complete Workflow Artifacts:

   ```bash
   pnpm exec tsx --tsconfig tsconfig.node.json ./scripts/build-workflows.ts
   ```

   The normal `pnpm build` also invokes this step. The standalone command scans every direct Workflow package and replaces the configured Artifact output tree, so do not point `--dist-root` at source or an unrelated directory.

4. Verify `dist/server/workflows/<stable-key>/<digest>/workflow.json` and each mapped `server/run/*.cjs`. The digest is the deployed hash used by management concurrency checks.
5. Start the application/runtime and invoke by the DSL package directory key after obtaining the bound runtime. Do not assume Artifact build itself writes database definitions.
6. If the Artifact has no synchronized id, first-enable with its deployed hash: `enable(hash)` or `POST /api/workflows/<hash>/enable`. Synchronized definitions use their database id.
7. Read/update administrator input overrides only if needed, and read them back.
8. Invoke business events by obtaining the bound runtime with `getRuntimeWorkflow(appRuntime)` and calling `workflowRuntime.trigger(key, input, options?)`, explicitly handling both `accepted` and `skipped`. Use the authenticated management `run` route only for an authorized manual run of an explicitly selected definition revision; it may be historical or disabled without changing enablement.
9. For an accepted trigger, wait for asynchronous persistence, then inspect the run, all relevant node attempts, and selected redacted payload/log records.

Keep those stages separate: source check does not prove run-entry buildability; Artifact build does not enable a definition; enablement does not invoke it.

## Top-level definition

`defineWorkflow()` accepts:

| Field         | Required | Contract                                                           |
| ------------- | -------: | ------------------------------------------------------------------ |
| `title`       |      yes | string                                                             |
| `description` |       no | string                                                             |
| `options`     |       no | JSON object; only use fields understood by the runtime/application |
| `parameters`  |       no | administrator scalar parameter declarations                        |
| `inputSchema` |       no | object-root Input Schema; default is `{ type: 'object' }`          |
| `nodes`       |      yes | ordered array of node expressions; may be empty                    |

There is no top-level `trigger`, `start`, node map, or edge list. The default export must be the direct/derived value returned by `defineWorkflow()` and the evaluated AST must be JSON-compatible: no functions, symbols, BigInt, Date, Map, class instances, circular references, or non-finite numbers.

## Input Schema

Input is supplied for each invocation and is persisted in the run. The root schema must have exactly `type: 'object'`. The current implementation accepts this subset:

- Metadata: `$schema` (2020-12 literal), `title`, `description`.
- Types: `null`, `boolean`, `number`, `integer`, `string`, `array`, `object`, including a type array.
- Structure: `properties`, `required`, `additionalProperties`, `items`.
- Values/limits: `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`.

`$ref`, `$dynamicRef`, `format`, and `$async` are explicitly rejected. Do not assume arbitrary JSON Schema keywords are implemented. At runtime, omitted `additionalProperties` behaves as `false`, so declare all accepted fields or explicitly set `true`/a schema. Input must be a JSON object, use finite numbers, and serialize to at most 65,536 UTF-8 bytes.

## Administrator parameters

`parameters` declares deploy-time settings; it is not invocation input. Each key must match `^[A-Za-z_][A-Za-z0-9_]*$` and cannot be `__proto__`, `prototype`, or `constructor`.

Each declaration accepts only:

- `type`: `string`, `number`, or `boolean`.
- Optional string `title` and `description`.
- Optional same-type finite scalar `default`.
- Optional `enum: { label, value }[]` for string/number only.

Enum values must be type-correct and unique; the default must occur in the enum. Boolean enum is invalid. Unknown declaration/option fields are invalid. There is no required marker: a missing override falls back to the DSL default, otherwise the value is absent.

Use an exact template such as `{{$parameters.approvalLimit}}` or JSON Logic `{ var: 'parameters.approvalLimit' }`. The key must be declared. `$parameters` templates cannot use inline defaults or nested paths.

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

`ConditionInstruction.create()` config accepts only optional `expression`. An omitted expression evaluates to `true`. The expression must evaluate to a boolean.

Supported JSON Logic operators are exactly:

`and`, `or`, `!`, `===`, `!==`, `>`, `>=`, `<`, `<=`, `in`, `var`, `startsWith`, `endsWith`.

Variable roots are exactly `input`, `parameters`, and `nodeResults`. Forbidden property segments are `__proto__`, `prototype`, and `constructor`. Limits are depth 32, total nodes 256, array length 64, and variable path length 256. Operator arity is validated; comparisons use same-type numeric or string ordering. The only branches are `yes` and `no`.

Condition has a built-in boolean result contract. It may therefore be referenced later as `$nodeResults.<conditionKey>` unless explicitly disabled with `result: null`.

## Run nodes and scripts

`RunInstruction.create()` config accepts only:

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

- `{{$input.path}}` reads invocation input.
- `{{$parameters.key}}` reads the resolved administrator setting snapshot.
- `{{$nodeResults.nodeKey.path}}` reads a visible declared upstream result.

An exact template preserves the underlying type. For example `{{$input.amount}}` can become a number. An embedded template such as `Amount: {{$input.amount}}` always becomes a string; `null`/`undefined` interpolate as empty text and objects as JSON text. Bare variable strings like `$input.amount` are also resolved, but explicit braces are clearer in DSL args.

JSON Logic drops the `$` and uses `input.path`, `parameters.key`, or `nodeResults.nodeKey.path`.

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
4. `schema`: Input Schema, parameters, node config, condition expression, and result schemas.
5. `semantic`: registered types, unique/safe keys, branches, declared parameters, and visible result references.
6. `compile`: flat IR topology must have one start, one owner per non-start node, no missing targets, cycles, or unreachable nodes.

`check` does not scan the complete package or write the database. In particular, it does not prove that `config.script` exists or was included, validate a script's relative/bare imports, bundle the run entry, or verify its named `run` export. Its `bundle` phase bundles and evaluates `workflow.ts`, not the run scripts. Do not publish/load after any issue. Error output contains phase, code, file/line where available, AST path, node key, and contract type; fix the earliest phase first because later phases depend on it.

The default app's separate Artifact build scans each direct Workflow package, applies secret/path limits, resolves run scripts inside the package, enforces local-import containment and the bare-import allowlist, bundles every entry, checks for named export `run`, and writes immutable Artifacts to its configured dist root. Runtime loading materializes new revisions; activation and enablement are separate management concerns.

### Deterministic definition builds

`workflow.ts` executes during check/build. Its evaluated JSON becomes part of the Artifact identity. Keep it a pure deterministic definition:

- Do not use `Date.now()`, random/UUID generation, current locale/time zone, machine absolute paths, environment-dependent branching, network calls, or mutable external state.
- Do not read undeclared files or reach outside the package during definition construction.
- Keep node array order intentional and stable; avoid filesystem/object enumeration whose order or contents vary by machine.
- Put runtime lookups and changing business data in `run` scripts, input, or declared administrator parameters.

Rebuild twice from unchanged sources when determinism is in doubt and compare the emitted digest. An unexpected digest change is a deployment change and must not be silently accepted during enable.

## Error-prevention checklist

- No legacy YAML, `trigger`, `start`, node map, numeric branch, or edge-list syntax.
- Import only Instruction classes exported by installed plugins and registered by the application.
- No invented nodes/operators/config fields.
- All objects and evaluated helpers produce JSON-only values.
- Input root is `object`; extra fields are deliberately allowed or rejected.
- Every input reference is declared and has no inline default/nested path.
- Every node key is safe, global, unique, and stable.
- Every branch belongs to the node contract.
- Every run script is static, named-exported, abort-aware, and idempotent.
- Every referenced run result has an accurate, lexically visible schema.
- The real six-phase checker passes, then the separate Artifact build proves package inclusion, import policy, and run bundling before load.
