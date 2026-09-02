---
'@nocobase/ai-employee': minor
'@nocobase/app-plugin-ai-employee': minor
'@nocobase/app-template-default': patch
'@nocobase/app-server': patch
---

Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. The App plugin now validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
