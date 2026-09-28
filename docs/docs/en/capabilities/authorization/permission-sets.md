---
title: 'Permission sets and assignments'
description: 'Configure pages, operations and record scopes around job responsibilities.'
---

# Permission sets and assignments

A permission set groups reusable capabilities. Name sets after real jobs, such as Sales engineer; express region and ownership as scopes rather than creating a role for every combination.

In Settings → Authorization → Permission sets, create or select a set, enable business operations, configure each operation's scopes, grant page access separately, then assign users or integrated teams. Permissions, assignments and basic information have their own save actions.

The permissions of a set are organized in three sections:

| Section              | What it grants                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Page permissions     | Entry to pages, listed from the application's menu and grouped the same way. “All pages” also covers pages added later. |
| Business permissions | Business operations such as View, Edit or Submit quotes, each with its record scopes                                    |
| Administration       | Settings pages and their actions, such as reading or changing permission sets, rules and other module settings          |

Under Business permissions and Administration, the left side lists one entry per module the application declares, such as Sales, Automation or Authorization; anything that names no module is listed under Other. Only pages, operations and settings that the application declares appear; a section is empty until developers add them. Plugins may add further sections.

| Setting       | Sales engineer example                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Page          | Quotes                                                                  |
| View          | Non-confidential reference quotes                                       |
| Edit          | Quotes prepared by the current user                                     |
| Submit        | Both an accessible quote and a project in the responsible region        |
| Writable data | Amount/notes for editing, status for submission; defined by the feature |

Page-only access cannot read the feature's data; an operation grant does not automatically open a page. A multi-table operation can expose several independent scopes, such as Quotes and Projects.

Assign sets directly to users or to registered teams/departments. Pickers use directories the administrator can read; an unresolved stored name does not mean an assignment disappeared. Multiple sources can contribute capabilities. Removing a team's engineer role should preserve a coordinator's direct project-manager job.

The default `member` set applies through the authenticated audience. Give it only capabilities every signed-in user should receive. Root provides unrestricted access and is unsuitable for ordinary job assignments or boundary testing.

Validate with two ordinary users and different records. Exchange detail URLs, test direct API calls, and test page-only, action-only, out-of-scope and revoked access. Use the [inspector](inspector) to identify remaining sources.
