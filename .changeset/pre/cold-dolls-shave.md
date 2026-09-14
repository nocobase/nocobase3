---
'@nocobase/app-plugin-authentication': patch
---

Name session cookies after the port an app is reached on, so two apps sharing a host no longer share a session

Cookies are scoped by host and path but never by port (RFC 6265), so two apps on one host share a cookie jar even on different ports. The cookie name was the only thing left to separate them, and it was derived from the app name alone — which every standalone app defaults to `main`. Two apps started on different ports both wrote `main.session_token` at path `/main`, so the second sign-in overwrote the first, and the overwritten side sent a token its own database had never issued.

The prefix now carries the port the app is reached on. A configured `publicOrigin` is authoritative, since it is what browsers actually see rather than the listen port a reverse proxy hides; when it carries no explicit port the prefix stays the bare app name, so an existing `https://example.com` deployment keeps its sessions. The listen port is the fallback for development, where `publicOrigin` is usually unset and the port is the only thing telling two apps apart, and it applies only to a standalone app — an embedded app is merged the same template defaults and so carries a `server.port` the host actually owns. Embedded apps keep the bare name, which their base paths already make distinct.

Development sessions of standalone apps are invalidated once on upgrade, as is any deployment whose `publicOrigin` names an explicit port. Setting `advanced.cookiePrefix` still overrides all of this.
