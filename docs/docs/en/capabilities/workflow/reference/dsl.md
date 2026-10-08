---
title: 'Workflow definition DSL'
description: 'Define input, administrator parameters, sequences, branches, and custom forms with the typed builder.'
keywords: 'NocoBase,workflow,Agent'
---

# Workflow definition DSL

This page documents public syntax, constraints, and a minimal example for developers and agents writing or reviewing code. The plugin Skill provides application development steps and validation guidance.

NocoBase 3 uses a typed TypeScript builder. Definitions describe versioned structure: input, parameters, ordering, and branches. Put calculations, queries, writes, and external calls in handlers that call application Services.

## Workflow packages

Applications read `workflows/`; each direct child directory is one package:

```text
workflows/quotation-routing/
├── workflow.ts              # Definition entry; default export is finalize()
├── server/                  # Run and Condition handlers
│   ├── calculate.ts
│   ├── needs-review.ts
│   └── record-route.ts
└── client/                  # Optional custom input and parameter forms
    └── parametersForm.tsx
```

The directory name is the workflow key used by business code. Keep it stable; titles and descriptions may change.

## Complete example

This quotation workflow includes input, administrator parameters, Run nodes, and a Condition with two branches. It ends after the selected branch. The `examples` template contains a runnable related example in `workflows/example-quotation-routing/`.

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
  title: 'Quotation routing',
  description:
    'Calculate the quotation and select manual follow-up or standard processing by the administrator threshold.',
  input: {
    schema: Type.Object(
      {
        quotationId: Type.String({
          title: 'Quotation reference',
          minLength: 1,
        }),
        amountCents: Type.Integer({ title: 'Amount in cents', minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  parameters: {
    schema: Type.Object(
      {
        reviewThresholdCents: Type.Number({
          title: 'Manual follow-up threshold in cents',
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
      title: 'Calculate quotation',
      description:
        'Validate input and return the quotation reference and total in cents.',
    }).run(defineHandler<typeof calculate>('./server/calculate')),
  )
  .addNode(
    createConditionInstruction({
      key: 'needsFollowUp',
      title: 'At or above the review threshold?',
      description:
        'Compare total with the threshold: at or above it, select manual follow-up; otherwise select standard processing.',
    })
      .check(defineHandler<typeof needsReview>('./server/needs-review'))
      .yes([
        createRunInstruction({
          key: 'manualFollowUp',
          title: 'Flag for manual follow-up',
          description:
            'Return and log the manual follow-up classification without changing orders.',
        }).run(defineHandler<typeof recordRoute>('./server/record-route')),
      ])
      .no([
        createRunInstruction({
          key: 'standardRouting',
          title: 'Standard processing',
          description:
            'Return and log the standard classification without changing orders.',
        }).run(defineHandler<typeof recordRoute>('./server/record-route')),
      ]),
  );

// Shared handler context; declare each member separately
export interface FlowContext {
  input: ContextOf<typeof flow>['input'];
  parameters: ContextOf<typeof flow>['parameters'];
  nodeResults: ContextOf<typeof flow>['nodeResults'];
}

const definition: WorkflowSourceAst = flow.finalize();
export default definition;
```

Its handlers:

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
  if (calculated === undefined)
    throw new Error('Missing quotation calculation result');
  const threshold = parameters.reviewThresholdCents;
  if (typeof threshold !== 'number')
    throw new Error('Missing manual follow-up threshold');
  return calculated.totalCents >= threshold;
}
```

```ts
// workflows/quotation-routing/server/record-route.ts
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { FlowContext } from '../workflow';

export function run(
  { input, nodeResults }: FlowContext,
  options: WorkflowRunOptions,
): { quotationId: string; route: string } {
  options.signal.throwIfAborted();
  if (typeof nodeResults.needsFollowUp !== 'boolean') {
    throw new Error('Missing quotation decision result');
  }
  const result = {
    quotationId: input.quotationId,
    route: nodeResults.needsFollowUp ? 'manual-follow-up' : 'standard',
  };
  options.logger.info('Quotation route selected', result);
  return result;
}
```

This example returns classification results and logs without writing business tables or waiting for approval. With the default threshold, `{ "quotationId": "Q-100", "amountCents": 150000 }` selects manual follow-up and returns `route: 'manual-follow-up'`. Amount `50000` selects standard processing.

Key points:

- Nodes declare neither argument mappings nor result Schemas. Handlers read `input`, `parameters`, and `nodeResults`; result types are inferred from handler returns.
- Use `import type` for handler signatures and `defineHandler<typeof run>('<module-path>')` for references. This avoids executing server code when definitions are checked or loaded. Both paths must refer to the same module.
- Default-export `flow.finalize()`, not the builder.

## Top-level definition

`workflow()` accepts:

| Field         | Required | Purpose                                                              |
| ------------- | -------- | -------------------------------------------------------------------- |
| `key`         | Yes      | Must match the workflow package directory name.                      |
| `title`       | Yes      | Name shown in management.                                            |
| `description` | No       | Business purpose; it can describe the latest change.                 |
| `input`       | No       | `{ schema, form? }` for per-trigger input; omitted means any object. |
| `parameters`  | No       | `{ schema, form? }` for administrator settings.                      |
| `inputSchema` | No       | Shorthand for `input: { schema }` when no custom form is needed.     |
| `options`     | No       | Version-level execution settings below.                              |

There is no `trigger`, `start`, node Map, or connection list. Triggers are defined separately; see [Trigger workflows](./service-api.md).

Supported `options`:

- `timeout`: overall timeout in seconds; zero or omission means unlimited.
- `stackLimit`: maximum appearances of this workflow in a nested call chain; default `1`, and `0` rejects nested calls.

These are published-version settings, not input or administrator parameters.

## Input

Input varies per event, such as a quotation reference and amount, and is stored as a run snapshot. Use exported `Type` (TypeBox) for precise handler types. Raw JSON Schema is also supported, with generic inferred types.

The root must be an `object`. Supported JSON Schema subset:

- Types: `null`, `boolean`, `number`, `integer`, `string`, `array`, `object`.
- Structure: `properties`, `required`, `additionalProperties`, `items`.
- Values and limits: `enum`, `const`, numeric bounds, string and array lengths.
- Metadata: `$schema`, `title`, `description`.

`$ref`, `$dynamicRef`, `format`, and `$async` are unsupported. Omitted `additionalProperties` is treated as disallowing extra fields. Input must be a JSON object serialized to no more than 65,536 bytes. Prefer business IDs; do not pass full models, files, or secrets.

## Administrator parameters

Parameters are small adjustable settings such as thresholds. They are snapshotted when a run starts, so later changes do not affect it.

`parameters.schema` is an object Schema. Each property allows only:

- `type`: `string`, `number`, or `boolean`.
- `title` and `description`.
- A `default` matching the type.
- `enum` for strings and numbers only: unique values, with any default included in the enum.

```ts
parameters: {
  schema: Type.Object(
    {
      strategy: Type.String({
        title: 'Assessment strategy',
        default: 'standard',
        enum: ['standard', 'conservative'],
      }),
    },
    { additionalProperties: false },
  ),
},
```

The default UI uses enum values as option labels. For friendly labels, provide a [custom parameter form](#custom-input-and-parameter-forms).

Parameters are not required: an unset value uses its default, or is absent if no default exists. Keep credentials in application configuration rather than input or parameters.

## Custom input and parameter forms

Default input forms support top-level strings, numbers, integers, and booleans. Default parameter forms suit strings and numbers; boolean parameters need custom controls. For complex input or better guidance, specify `form` in `input` or `parameters`:

```ts
parameters: {
  schema: Type.Object({ /* ... */ }),
  form: './client/parametersForm.tsx',
},
```

- Paths are relative to the workflow package and must be inside `client/`.
- Default-export a React component receiving `WorkflowParameterFormProps` from `@nocobase/app-plugin-workflow/client`: `schema`, `value`, `defaults`, `disabled`, and `onChange`.
- Forms are built with the version; later changes do not alter published versions.
- Keep dependent components inside the package so the Artifact is self-contained.

The `examples` template’s `example-quotation-routing` includes complete input and parameter forms.

## Ordering and branches

- Consecutive `addNode()` calls define a sequence. The builder is immutable: retain or chain the returned builder. Discarding it and finalizing the original reports omitted nodes.
- Condition defines `.yes([...])` and `.no([...])`; either or both can be omitted. `.branch({ yes: [...], no: [...] })` is also supported.
- After a branch, execution continues at the next sibling of the Condition, shared by both branches.
- `goto`, arbitrary joins, loops, and cross-branch connections are unsupported.

See [Nodes](./nodes/index.md) for details.

## Handlers and shared context

- Export a named `run`. Its first argument is `{ input, parameters, nodeResults }`; the second supplies `services`, `signal`, and `logger`. See [Run](./nodes/run.md).
- Declare `FlowContext` members **separately** using `ContextOf<typeof flow>`, as above. Do not use `type FlowContext = ContextOf<typeof flow>`; it can cause circular inference.
- Handlers referencing `FlowContext` should declare explicit return types for the same reason.
- `nodeResults` includes types for every node, including branches, but every result can be `undefined`. Types guarantee neither order nor branch execution; check before reading.
- `finalize()` verifies each handler’s required context against the workflow.

## Node keys and descriptions

- Keys are globally unique within the workflow, including branches, and match `^[A-Za-z_][A-Za-z0-9_-]*$`. They cannot be `__proto__`, `prototype`, or `constructor`.
- Keep a key stable when business meaning is unchanged; history, diagnostics, and results use it.
- Every node should describe its business purpose, actual logic, and side effects. Administrators see this when clicking it. Condition descriptions should explain the rule and both branches.

## Deterministic definitions

Checks and builds execute `workflow.ts`, and its output contributes to the version digest:

- Use only JSON-compatible values, not functions, Date, Map, class instances, BigInt, or circular references.
- Do not use `Date.now()`, randomness, current timezone, absolute machine paths, environment-dependent branches, or network calls.
- Put changing business data in handlers, input, or parameters.

## Common questions

### Why can node results be undefined?

Types describe possible results, not whether a node executed. Nodes on unselected branches or after early termination have no results.

### Why must handlers be imported as types in definitions?

Value imports load modules and dependencies and execute their top-level code, such as database client initialization. Definitions need signatures only; use `import type`, then load by module path at runtime.

### Why are some JSON Schema keywords unavailable?

Workflows implement a controlled subset. Use the list above and the Workflow Skill.
