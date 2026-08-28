---
'@nocobase/app-template-default': patch
---

Restore the `plugin:register`, `plugin:unregister`, `plugin:update`, `plugin:skills:sync`, and `client:inspect` scripts, along with the `@nocobase/nb3-cli` dependency they invoke. A merge resolution dropped them, which left the workflow documented in `docs/cli/README.md` unrunnable: the scripts these docs tell users to run did not exist in the template.

Nothing at runtime reads these scripts, so their absence broke no build and failed no test. A new test asserts the documented command surface, so the next time one goes missing it fails loudly instead of silently.
