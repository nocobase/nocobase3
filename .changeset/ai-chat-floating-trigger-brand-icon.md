---
'@nocobase/app-plugin-ai-employee': patch
---

Use the NocoBase AI chat mark for the floating AI employee chat entry instead of the generic `lucide-react` `Bot` glyph on a solid primary square. The trigger now shows the same brand artwork the Portal template uses for this entry.

The mark ships as an inlined `NocoBaseAIChatIcon` React component under `shared/icons/` rather than an `.svg` asset import. Registry source is copied into an application and typechecked with plain `tsc`, so an asset import would require shipping a `declare module '*.svg'` declaration into every consuming application alongside it.
