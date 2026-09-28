---
'@nocobase/app-cli': minor
'@nocobase/app-skills': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

`nocobase plugin update` no longer leaves an upgraded plugin with an unsatisfied peer dependency behind a package manager warning. After the upgrade it reads each upgraded plugin's `peerDependencies`, compares them with the versions installed beside the plugin using a semver range check, and skips optional peers that are not installed. A peer whose declared range in the application admits the required version is updated within that range and reported in `result.peerUpdates`; a peer the declared range excludes, or the application does not declare, fails the run with `PLUGIN_PEER_UNSATISFIED`, naming each plugin, peer, required range and installed version, and suggesting the install that fixes it. Previously such an update succeeded and the application failed later, with a Rollup "is not exported by" error in `pnpm build` or a plugin page that did not load in development. The application templates and the `nocobase-app-development` Skill describe the check.
