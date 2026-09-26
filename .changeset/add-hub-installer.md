---
'@nocobase/hub-installer': minor
---

Add `@nocobase/hub-installer`, which installs a NocoBase 3 Hub on a server without changing its source. `hub-installer install <dir>` generates the Hub from the published `@nocobase/app-template-hub`, builds it in a temporary directory, keeps only the deployment archive under `releases/<version>/hub`, writes `config.yml` and `hub.env` outside the release, applies the migrations, and starts it with pm2 until its health check answers; a failure before the Hub is switched on removes everything it wrote. `hub-installer status` reports the current version, health, pm2 process, releases, Node compatibility and whether a newer version is published. Both take `--json` and return the same envelope shape as the application CLI.
