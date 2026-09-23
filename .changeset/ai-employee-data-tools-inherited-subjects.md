---
'@nocobase/app-plugin-ai-employee': patch
---

Let the data tools see what a user can read through a team or other membership

The built-in data tools authorize as the current user, but built that identity by hand from the user and `authenticated:*` alone. An HTTP request also carries every subject the authorization service resolves for the user — team memberships and anything else an application registers with `resolveFor` — so a collection granted to a team was readable on the page and invisible to the assistant, with the same empty discovery as an unregistered collection. The tools now resolve those subjects the way the request middleware does.
