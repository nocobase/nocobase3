---
title: 'Restriction rules'
description: 'Keep granted and shared data within a required boundary.'
---

# Restriction rules

A restriction describes records still allowed. “Non-confidential” retains public records and excludes confidential ones; do not accidentally select the records you intend to prohibit as the allowed scope.

In Settings → Authorization → Restriction rules, select affected subjects, resource, action and scope. Validate using an ordinary user with broad positive access or sharing; excluded records must remain inaccessible.

Business rules limit the selected operation branch. If an invariant must cover every operation and direct collection access, tell the AI agent explicitly so the developer applies a collection-level restriction. Nested relation targets also require explicit design; ordinary target collection restrictions do not automatically protect relation writes.

A limit that must survive leaving a team cannot be assigned only to that team. A coordinator with a direct manager role may need a direct restriction too. Unrestricted administrators bypass these constraints, so use ordinary accounts for verification.
