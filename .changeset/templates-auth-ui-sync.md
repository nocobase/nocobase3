---
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
'@nocobase/app-template-examples': patch
---

`client/extensions/nocobase-auth-ui/` now matches the UI Library's `auth-ui` file for file, and `tests/scripts/template-ui-library.test.mjs` keeps it that way. Its relative imports carry the `.js` extension, and it ships its `locales/`, which `client/locales/en-US.ts` and `zh-CN.ts` spread ahead of the application's own keys instead of repeating them. No wording changes, and `PasswordLoginForm` still shows the sign-up link only while `useSignUpAvailable()` allows it.

An application generated earlier keeps working as it is. To follow, copy `client/extensions/nocobase-auth-ui/` from the new template, `locales/` included, and in `client/locales/` replace the `auth.*` keys the block provides with a spread of its locale files, as the block's README shows. Keep the application's own `auth.*` keys, such as `auth.welcome`, which the block does not provide.
