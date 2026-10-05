---
'@nocobase/create-plugin': patch
---

A generated plugin's `AGENTS.md` names `@nocobase/app-testing/client` for page tests: `renderWithApp()` renders a page inside a client application with the plugin's services and translations, and `answerApi()` answers the requests it sends, instead of a `vi.mock('@nocobase/app-client')`.
