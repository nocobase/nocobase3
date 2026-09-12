---
'@nocobase/nb3-cli': minor
---

Register a plugin's client entry as `<package>/client` rather than `<package>/client/plugin`, matching the barrel default export plugins now ship.

The server-only check follows the same move: it looks for `exports["./client"]`, because that is the specifier registration writes and the check has to match it. A plugin published with only `./client/plugin` predates the barrel, so it is skipped rather than wired to an import the application cannot resolve.

Reading tolerates both forms. An application wired before this change imports `<package>/client/plugin`, and treating that as unregistered would make `plugin register` add a second, conflicting import for a plugin that is already there.
