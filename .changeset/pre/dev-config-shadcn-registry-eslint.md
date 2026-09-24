---
'@nocobase/dev-config': patch
---

Relax the rules shadcn/ui registry output trips over in `createPortalConfig`, for `client/components/ui/**/*.tsx`, `client/hooks/use-mobile.ts` and the recharts payloads in `client/components/ui/chart.tsx`.

`shadcn add` copies these files from the upstream registry verbatim, and `shadcn add <name> --diff` is only meaningful while the local copy matches, so rules such as `react-refresh/only-export-components` report on a shape nobody here chose and whose only available fix is the edit that destroys the diff. Putting the exception in the factory rather than in each `eslint.config.js` means every portal that adds a registry component gets it — the applications generated from the templates included — instead of each one discovering the same failure and writing the same block. Everything outside those paths, `client/components/` included, is held to the full rule set, and a portal can still override the relaxation through `overrides`.
