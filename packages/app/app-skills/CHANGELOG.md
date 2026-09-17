# @nocobase/app-skills

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
