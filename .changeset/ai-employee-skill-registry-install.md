---
'@nocobase/app-plugin-ai-employee': patch
---

Document how a code agent installs the `nocobase-ai` Registry item in the AI Employee App Skill. The Skill previously assumed `client/extensions/nocobase-ai` was already present and offered no way to obtain it, so an agent working in a generated application had no correct path to the chat UI.

The Skill now orders the installation options and prefers installing from the plugin version already resolved in the application's own `node_modules`, using the `files[].target` mapping in the published `public/r/nocobase-ai.json`. That keeps the installed UI byte-identical to the canonical source for the plugin the application actually runs, without network access or a NocoBase source checkout, and avoids the version skew of installing from a hosted Registry URL. Workspace materialization and hosted `shadcn add` remain documented for the cases where they apply, and both installers refuse an existing target so application-owned source is never overwritten.

Correct the item's `requiresPlugins` constraint, which still read `>=0.0.1 <0.1.0` from the release that first published this Registry. Under standard semver prerelease rules that range excluded the plugin's own `0.1.0-beta.19`, so a consumer that checked the constraint before installing would have refused every current version. It now reads `>=0.1.0-beta.0 <1.0.0`, covering the whole 0.1.0 line the plugin has shipped since.
