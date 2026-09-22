---
"@nocobase/app-template-examples": patch
"@nocobase/app-template-hub": patch
---

Scope the ESLint exceptions the shadcn/ui registry output needs in all three templates, not in Default alone. Each template ships registry files under `client/components/ui/`, so the relaxations belong wherever those files live, and the three `eslint.config.js` files are byte-identical again — which is what `tests/scripts/template-framework-alignment.test.mjs` compares. The override entries lose their `app-template-default/` prefix, which named the wrong package once a second template carried them.

