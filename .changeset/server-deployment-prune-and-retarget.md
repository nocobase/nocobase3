---
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
---

Make `dist/` a deployment that runs without an install step or a compiler on the target machine.

`pnpm build` now removes what the server never loads and makes every native binary match the platform being deployed to. The dependency tree drops from 542 MB to 111 MB in the default template and from 206 MB to 50 MB in Hub, because resolving `dependencies` transitively is a package-level answer to a file-level question: 296 packages were installed whole to satisfy a read of their `package.json`, `lucide-react` contributing 31 MB of React components to a tree with no browser in it.

The build targets the machine it runs on, so `pnpm build && pnpm start` still works. Deploying elsewhere takes `--target linux-x64` (or `linux-arm64`, `linux-x64-musl`, `darwin-arm64`, `win32-x64`) and `--node-version` when the server's Node major differs; a `.node` binary is compiled for one platform, architecture, C library, and Node ABI at once. Each build states the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

Add `pnpm server:deps:inspect`, which reports the same analysis without changing anything, alongside `pnpm server:deps:prune` and `pnpm server:deps:retarget`. Packages an application resolves by a name assembled at runtime are named in `nocobase.serverDeps.keep`, with `--keep` for a single build; packages the framework resolves by name and directories read by scanning are kept without configuration.
