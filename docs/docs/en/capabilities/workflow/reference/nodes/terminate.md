---
title: 'Terminate node'
description: 'End a workflow early from its main sequence or a conditional branch.'
keywords: 'NocoBase,workflow,Agent'
---

# Terminate node

Terminate saves its own record, then immediately ends the whole run. Use it for expected business exits that do not require further processing and are not code exceptions.

## Define a termination node

```ts
createTerminateInstruction({
  key: 'stopIncompleteProfile',
  title: 'Incomplete profile: end processing',
  description:
    'End processing without opening an account when required profile fields are missing.',
}).outcome('success');
```

`outcome()` accepts `success` (default) or `failure`. Failure is an explicit business conclusion, distinct from an execution error thrown by a handler.

## Terminate inside a branch

```ts
const flow = source
  .addNode(
    createConditionInstruction({
      key: 'canContinue',
      title: 'Profile complete?',
      description:
        'Open an account if the profile is complete; otherwise end processing.',
    })
      .check(isProfileCompleteHandler)
      .no([
        createTerminateInstruction({
          key: 'stopIncompleteProfile',
          title: 'Incomplete profile: end processing',
          description:
            'End successfully for an incomplete profile and skip all later steps.',
        }).outcome('success'),
      ]),
  )
  .addNode(
    createRunInstruction({
      key: 'openAccount',
      title: 'Open account',
      description: 'Open an account for a customer with a complete profile.',
    }).run(openAccountHandler),
  );
```

When the profile is incomplete, `openAccount` does not execute. Terminate ends the workflow, not just the current branch.

## Termination, failure, and error

- Successful termination: the workflow ends early as expected.
- Failed termination: the workflow reaches a business failure conclusion.
- Execution error: a handler, module, infrastructure component, or business call throws an exception.

Terminate has no result and cannot contain branches. It does not undo earlier committed writes or external calls.

## Common questions

### Why is the parent Condition still Pending after the run ends?

Terminate inside a branch ends the entire run before the parent’s normal finalization. The parent may remain Pending. Use the Terminate node and overall terminal state to assess this; it is not a stuck execution.

### Should I terminate or throw an error?

Use Terminate for expected business exits. Throw when the handler cannot complete its promised action or encounters an unexpected problem. Do not mask execution faults with successful termination.
