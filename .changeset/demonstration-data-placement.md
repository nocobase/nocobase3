---
'@nocobase/db': patch
'@nocobase/app-skills': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Give sample and demonstration data a home. The `nocobase-db` Skill ruled that "a seed is never sample or demonstration content" without saying what carries it instead, so an application asked to open with example records had nowhere to put them and wrote them into a seed anyway, mixed in with the data the application needs to run. Section 2 now separates the two: a demonstration keeps seeds of its own, named for what they carry and holding nothing required, optionally gated on a setting read from the seed's `config` — decided once per database, because a seed that returns early is still recorded as executed — while data meant to be reloaded on demand belongs in an application command, which records no history. The application-side placement, including `pnpm nocobase db reset --force` for a disposable database, is in the `nocobase-app-development` migrations reference, and each template's `AGENTS.md` points at it.
