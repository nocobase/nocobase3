---
title: 'Describe permissions to AI'
description: 'Express jobs, operations, data relationships and acceptance criteria.'
---

# Describe permissions to AI

Start from business facts rather than API names. Ask the coding agent to use the current application's authorization Skill and clarify missing access decisions before granting rights.

```text
Develop sales permissions in this NocoBase 3 application. Read the App development Skill and installed nocobase-app-plugin-authorization Skill; use the default-access, sharing-rules and restriction-rules Skills when needed.

Jobs: assistants read; engineers prepare quotes; managers maintain their projects; delivery specialists arrange order delivery.
Pages: assistants/engineers enter Projects and Quotes; delivery specialists enter Orders only. Configure page access separately from operations.
Quotes: engineers consult non-confidential reference quotes and edit only amount/notes on quotes they prepared. Submission also requires responsibility for the actual parent project's region. An out-of-region personal draft can be edited but not submitted.
Collaboration: a proposal team can take over selected quotes for editing and submission. Submission must authorize both quote and parent project. Sharing cannot grant a missing job operation.
Restrictions: sharing must not reopen confidential records. Identify whether each limit is operation-specific or collection-wide.
Relations: delivery specialists may associate active teams, maintain checks and collaborator notes, but not team data, protected foreign keys or internal notes.
Inheritance: direct jobs survive removing a team source.
Administration: only designated administrators can change assignments and rules.
Acceptance: test ordinary users, ownership/region/confidential records, direct API denial, relation rollback and revocation. Do not test only as root.
```

Ask for a job × page × operation × scope matrix and explicit unresolved business decisions. After implementation, ask which settings administrators can change, which field/relation capabilities are code-owned and how to add an operation.

Require server-side policy enforcement, input validation, workflow-state checks and transactions. Initial configuration should create missing records without overwriting administrator changes on startup. If a plugin, strategy or membership model is missing, the agent should identify and implement that prerequisite.

Use the authorization example's responsibilities and handover patterns, not its demo users, fixed IDs or practice reset. For an existing system, prefer a precise change request: “Let managers view regional quotes while only preparers edit amounts; let managers submit quotes for their projects, retaining confidentiality and existing assignments.”
