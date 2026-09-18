---
title: 'Inspect permission results'
description: 'Understand decisions, scope conditions and authorization sources.'
---

# Inspect permission results

In Settings → Authorization → Inspector, choose a user or other subject, then a resource and operation. Inspection requires its own permission; permission-set management access does not automatically include it.

Results distinguish allowed, limited, denied and failed checks. Details show sources, named scopes and, when needed, fields and execution conditions. A configured-permission marker indicates stored configuration, not access to every row. Inspection does not count accessible records.

An engineer may edit their own quote but fail Submit because the parent project is outside their region. Compare the operation's scopes. An invalid amount or a changed workflow state instead requires inspecting the business error.

Inspecting a user includes resolved active memberships and the authenticated audience. Inspecting a team directly describes that team's grants, not the union of every member's personal rights. Choose the actual user to diagnose their effective access.

Check installed capabilities, assignments, active memberships, action/scope names, all required shared records, restrictions and business state. Confirm with the user's actual API request; a visible button or configuration marker is not enough.
