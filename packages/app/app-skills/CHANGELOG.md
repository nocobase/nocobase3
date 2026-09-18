# @nocobase/app-skills

## 0.0.2-beta.2

### Patch Changes

- d4ca00e: Expose useApiClient as a no-argument Hook for resolving the current application's API client and document it as the convenient React entry point. Existing useService(apiClientToken) calls remain supported.
- d4ca00e: Clarify React API client access through useApiClient and retain explicit client resolution for non-React code in application and inbox Skills.
- f13bd0c: Clarify page authoring references, child routes for page Tabs and overlays, and page container ownership in the application development Skill.
- 365a9fe: Document semantic translation key naming, grouping, interpolation, and rename guidance with examples for application and plugin development.
- 60fa139: Preserve Hub publishing guidance in the shared application skill and scope it to Default applications that provide upload and deploy commands.
- d4ca00e: Document frontend API client usage, request and Repository response contracts, uploads, cancellation and error handling in a dedicated application Skill reference.
- d4ca00e: Use useApiClient() for React API client access across application pages, plugins and shared examples, preserving application-scoped client resolution.
- 60fa139: Wait for the final deployment result by default in app deploy and app upload --deploy. Support --no-wait for asynchronous acceptance, preserve explicit --wait compatibility, and keep upload-only commands independent of deployment polling.

## 0.0.2-beta.1

### Patch Changes

- 6e15911: Register all application plugins as production dependencies so they reach deployments, migrate legacy development declarations, and preserve declared version ranges when registering existing plugins.

  Document plugin dependency placement and migration in the shared application development Skill.

## 0.0.2-beta.0

### Patch Changes

- d86f6aa: Synchronize agent skills from direct NocoBase package dependencies with the new skills:sync command while preserving plugin:skills:sync compatibility, and share application development and upgrade skills through @nocobase/app-skills across all application templates.

  Add package:remove to uninstall a NocoBase dependency and clean up its synchronized skills and ownership records, reusing plugin unregistration for plugin packages. Document the removal workflow in application templates and the shared development and upgrade skills.

## 0.0.1

### Patch Changes

- Add the initial NocoBase application development and upgrade Skills.
