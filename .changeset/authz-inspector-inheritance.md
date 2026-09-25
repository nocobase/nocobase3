---
'@nocobase/app-plugin-authorization': minor
---

`POST /inspector/configured` also answers the inherited `identity.subjects` and, per effective set, the assignments that bring it (`ConfiguredPermissionSet`); the inspector shows which subjects a user inherits from and whether each granting set comes through one of them or a direct assignment. A subject option's `title` and `description` may now be a `{ key, ns }` translation descriptor, which the subject picker, assignment lists, rule panels and inspector render in the viewer's language; the client `SubjectOption` types them as `LocalizedText`. A permission-set assignment change to any subject other than a user now refreshes every signed-in client, so members of a department see the change without reloading.
