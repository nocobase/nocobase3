---
title: 'Work with an AI Agent'
description: 'Describe business requirements, review the result, and advance your project one step at a time.'
---

# Work with an AI Agent

After [your first feature](../get-started/first-feature.md), you have completed one cycle: explain a requirement, change code, run checks, and inspect the result. Use the same rhythm for the next feature.

This section covers an AI Agent working in your application project. AI employees and knowledge bases inside the application are [built-in capabilities](../capabilities/index.md); configuring them is not a prerequisite for coding with an AI Agent.

## When to read this section

Use this section once you can run an application and want to add features consistently. Business readers can focus on rules and user-visible results; developers can also review code differences, APIs, and automated tests.

## A collaboration cycle

1. Explain who performs which operation, including data and constraints.
2. Ask your AI Agent to inspect the project and identify the affected parts.
3. Implement one bounded feature and try it in the running application.
4. Report concrete differences, recheck the fix, and continue to the next step.

“Build an order system” leaves many decisions open. “Salespeople can submit only their own draft orders, changing their status to Pending approval” maps directly to actions, permissions, and state checks.

## Choose a topic

| Your question                                      | Read                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| The feature does not match what I wanted           | [Write requirements](./writing-requirements.md) |
| Your AI Agent says it is done; how do I verify it? | [Review AI Agent output](./reviewing-output.md) |
| The task spans many pages and business rules       | [Build complex features](./complex-features.md) |
| I repeat the same project instructions every time  | [Add team conventions](./team-conventions.md)   |

Make each round runnable and reviewable before expanding it. You do not need to know every file to change, but you do need a clear goal and a way to recognize a correct result.
