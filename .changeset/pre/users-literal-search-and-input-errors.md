---
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-plugin-users': patch
---

Match the user search as literal text, and stop reporting server faults as invalid input.

`UserAdministrationService.list` now reads through the Repository, whose `includes` treats the search term as literal text: `%` and `_` typed into the user search box mean themselves instead of acting as SQL wildcards, where `%` previously listed every account. The page is ordered by creation time with `id` as a tiebreaker, so accounts created in the same instant cannot repeat or disappear between pages.

The `/api/users` routes answer `400 INVALID_USER_INPUT` only for their own request parsing. A `TypeError` raised anywhere else, such as a defect in a registered `UserRoleScope`, is no longer returned to the caller as invalid input carrying an internal message; it surfaces as a server error.
