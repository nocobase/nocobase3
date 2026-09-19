---
'@nocobase/app-server': patch
---

Expose the application mode to plugin service providers

`AppPluginApplication` carried no way to tell whether the app owns the process it runs in or is one of several an app host mounted, so a provider that needs the distinction had to infer it from configuration that cannot carry it. A template's defaults are merged in both modes, which means an embedded app holds a `server.port` it does not own — enough to mislead any provider reading it.

The field is optional, so an application composed by hand need not state it, and absent means embedded, matching what `Application` itself defaults to.
