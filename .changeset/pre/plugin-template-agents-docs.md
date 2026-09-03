---
'@nocobase/create-plugin': minor
---

Generate `AGENTS.md` and `CLAUDE.md` in every new plugin, documenting where a dependency goes: server runtime imports in `dependencies`, client and build-time imports in `devDependencies`, and packages the application must own a single copy of in `peerDependencies`. A plugin created without that guidance reintroduces the browser packages in `dependencies` that this repository has just finished removing.
