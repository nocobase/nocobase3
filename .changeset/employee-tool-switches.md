---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Add persistent employee tool selection with legacy inheritance for omitted or null selections and explicit disabling with an empty selection. Apply selections to discovered, injected, and skill-activated tools without allowing session settings to broaden access, preserve saved custom tool approval settings across registration and restart independently of explicit tool selections, and retain unknown saved names for future registrations. Selected optional tools still require their runtime capabilities, including current-user knowledge-base access.
