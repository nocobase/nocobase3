# Prettier configuration

The default export is the explicit NocoBase formatting baseline. Re-export it
from a package or repository `prettier.config.js`:

```js
export { default } from '@nocobase/dev-config/prettier';
```

Use Prettier independently from ESLint:

```sh
prettier --check .
prettier --write .
```

When both tools fix files, run `eslint --fix` first and `prettier --write`
second. The ESLint factories include `eslint-config-prettier` last so stylistic
rules do not conflict with formatting, then restore the matching single-quote
rules so ESLint enforces the shared quote style too.

If a project has a documented formatting requirement, extend the object rather
than copying it:

```js
import sharedConfig from '@nocobase/dev-config/prettier';

export default {
  ...sharedConfig,
  proseWrap: 'always',
};
```
