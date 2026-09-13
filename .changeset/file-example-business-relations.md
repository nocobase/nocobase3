---
'@nocobase/app-plugin-file-example': minor
---

Add one-to-one and one-to-many file relation examples

The example now owns `fileExampleProfiles` with a single avatar file (unique
`profileId`) and `fileExampleOrders` with any number of attachments, each with
its own File Repository resource and seeded demo rows. `/file-repository` became
a navigation group with three pages: the flat repository page, profile avatars
(one-to-one) and order attachments (one-to-many).

Both relation pages upload through a file repository, then connect the returned
record through the owning business repository's write policy; replacing an
avatar clears the previous link, and unlinking an attachment leaves the file
record in the repository. Uploads, lists and previews reuse small App-owned
components that render images, PDFs and text inline and reject active content.
The example no longer ships an Agent Skill; its README documents the pages,
tables and routes, and the core plugin's Skill covers the file services.
