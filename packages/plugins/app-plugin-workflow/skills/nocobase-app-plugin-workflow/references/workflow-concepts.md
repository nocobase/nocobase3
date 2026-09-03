# Workflow Concepts

## What a workflow is

A NocoBase 3 workflow is a source-managed, versioned description of a business process. Its definition declares an invocation input contract, administrator parameters, an ordered tree of nodes, branch rules, node configuration, and stable node keys. At runtime, each accepted invocation is persisted as a Workflow Run tied to one exact definition version and artifact hash. Node Runs preserve the executed path, status, timing, result, error, and logs.

The workflow answers process questions: where is this business case, why did it take this path, what happened at each step, and what follows. Ordinary code answers implementation questions: how to calculate, validate, transform, query, or call a particular system.

## When to use it now

With the default application's currently aggregated `condition`, `run`, and `terminate` instructions, prefer Workflow when one or more of these are central:

- Background business steps must execute in a durable, explicit order and survive worker restarts.
- Ordered steps and conditional paths must be explicit and reviewable.
- Operators need versioned definitions and inspectable execution history.
- Typed scripts coordinate services or external systems without requiring a pause for human parameters.
- Event-key idempotency, node timeout, audit history, or process-level diagnosis matters.

Prefer ordinary typed code or a service when the operation is atomic, synchronous, algorithm-heavy, dominated by data transformation, or needs no process state/audit trail. A common design is code inside one `run` node, followed by a `condition` that uses its declared result to choose the process path.

Long-running human approval, externally resumable waiting, loops, notifications as process instructions, and subflows are product-direction scenarios, not default-template capabilities. They apply only after the owning plugin exports the corresponding Instruction class, the target application supplies it to the checker and Artifact-build registry, registers it with the runtime, and enables the plugin. A `run` script cannot suspend/resume the processor or manufacture those control-flow semantics.

## Current conceptual boundaries

- A workflow describes process control, not every business rule.
- The TypeScript DSL is authoring parameters. Loading compiles it to immutable tree-shaped IR and materialized definitions; runtime does not reinterpret the current source file.
- Invocation source is outside the definition. The DSL has no `trigger` field. Cron, webhook, domain event, or another module calls the internal workflow service.
- The current workflow plugin exports `ConditionInstruction`, `RunInstruction`, and `TerminateInstruction`. `terminate` can finish the complete execution early, including from inside a condition branch. Do not assume approval, wait, loop, notification, subflow, or other Instruction classes unless an installed plugin exports them and the application registers them.
- Extension discovery is not automatic across layers. Confirm the exported Instruction class, checker contracts, Artifact builder registry, runtime registry, and owning plugin deployment separately.
- The topology is an ordered tree of blocks with branches and common successors, not an arbitrary DAG: no `goto`, joins, general cycles, or cross-branch edges.
- Workflow input (per invocation) and workflow input (administrator configuration) are different contracts and different lifecycles.

## Definition and execution terms

| Term          | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| workflow key  | Stable package directory name used by business `trigger()` calls         |
| definition id | A particular persisted workflow revision, used by management operations  |
| current       | The selected revision for a workflow key                                 |
| enabled       | Whether normal business invocation is accepted                           |
| artifact hash | Immutable package/build identity used by runs and run scripts            |
| event key     | Unique invocation identity and idempotency key                           |
| Workflow Run  | One persisted invocation tied to a concrete definition                   |
| Node Run      | One node attempt inside a Workflow Run; reruns can create later attempts |

## Design check before authoring

Write down:

1. The stable business event and workflow key.
2. The per-run JSON input and its strict schema.
3. Administrator-tunable scalar parameters and safe defaults.
4. Ordered process steps and branch decisions.
5. Side effects and their idempotency/compensation behavior.
6. Stable node keys that survive title and layout changes.
7. Expected outputs required by later nodes, with precise result schemas.
8. Operational evidence needed when a step fails.

If the proposed process cannot be expressed with the application's registered node contracts, do not invent DSL. Implement/register an instruction or move the behavior into a `run` script, depending on whether it introduces process semantics or merely performs business work.
