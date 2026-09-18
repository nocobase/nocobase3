---
title: 'Permissions'
description: 'Assign job capabilities and scope data through business relationships.'
---

# Permissions

Authorization answers three separate questions: which page a person can enter, which business operation they can perform, and which records that operation may use. A sales engineer may edit a quote they prepared but submit it only when they also have responsibility for its project. Opening a page does not grant its data operations.

| Capability           | Purpose                                               | Example                                              |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Permission sets      | Assign reusable job capabilities and pages            | Sales engineer, project manager, delivery specialist |
| Record scopes        | Select the records an operation can use               | Prepared by me, my region, assigned projects         |
| Default access       | Give existing action holders a common record baseline | Non-confidential reference quotes                    |
| Sharing rules        | Add records or a dynamic range for collaborators      | Hand a quote to a proposal team                      |
| Restriction rules    | Narrow records otherwise accessible                   | Exclude confidential projects                        |
| Permission inspector | Explain decisions and their sources                   | Why editing is allowed but submission is denied      |

The main authorization plugin provides permission sets, page and business permissions, and inspection. Default access, sharing and restrictions are optional plugins. If a settings section is missing, ask the developer to check installation and configuration.

Developers or AI coding agents define operations, fields, relations and scope choices, then enforce them on the server. Administrators assign sets and configure scopes/rules. The permission editor does not edit arbitrary database fields; adding a writable field requires changing the business operation's declaration.

Teams/departments require an integrated membership model. A user can hold direct and inherited grants; removing one source does not remove the others. Start with [permission sets](permission-sets), then [scope rules](data-scopes), [AI development requests](develop-with-ai) and [inspection](inspector).

Unrestricted administrators bypass business scope rules, so use ordinary accounts for validation. Protected set keys cannot be renamed. The default set permits allowed content edits but cannot be deleted or lose its default assignment through generic management. Removing the final active administrator assignment is also prevented.
