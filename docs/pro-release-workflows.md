# Running Pro releases from the open-source repository

The open-source repository hosts three workflows that operate on `nocobase/nocobase3-pro`: **Release Pro Beta**, **Promote Pro Beta to Stable**, and **Release Pro Stable**. They use public-repository Actions minutes, but all generated branches, tags, pull requests, GitHub Releases, and npm packages belong to the private Pro repository. The jobs do not upload commercial source, package tarballs, or smoke-test logs as Actions artifacts.

Each workflow can be started manually. `oss_sha` may be left empty for a manual run; the job resolves the matching OSS branch once and freezes that commit for the whole run. Calls made by the OSS release workflows always pass their exact tested and published commit so the Pro release cannot drift to a later branch tip.

Set the following in the `nocobase/nocobase3` repository before running these workflows:

| Setting                    | Kind             | Purpose                                                    |
| -------------------------- | ---------------- | ---------------------------------------------------------- |
| `NOCOBASE_APP_ID`          | Actions variable | App ID for the `nocobase` GitHub App                       |
| `NOCOBASE_APP_PRIVATE_KEY` | Actions secret   | Private key for that App                                   |
| `PRO_NPM_TOKEN`            | Actions secret   | Publishes commercial packages to `https://npm.nocobase.ai` |
| `FEISHU_WEBHOOK`           | Actions secret   | Existing release notification webhook                      |

The GitHub App must be installed on `nocobase/nocobase3-pro`. Its installation token needs repository Contents, Pull requests, and Workflows write access there; Workflows permission is needed when a promotion carries workflow changes from Pro `develop` into `main`. The workflow's own `GITHUB_TOKEN` has read-only access to the OSS repository and is never used to write the private repository. A read token is created for checkout, then a fresh write token is created after build and test because installation tokens expire after one hour.

OSS releases use the same App credentials with installation tokens scoped separately to `nocobase3`. Both sets of workflows create local Git commits with the verified `nocobase[bot]` account ID `179432756`.

The OSS **Release Beta**, **Release Stable**, and **Merge Beta to Stable** workflows each expose an `include_pro` checkbox in **Run workflow**, enabled by default. Leave it checked to run the corresponding Pro operation after OSS succeeds, or uncheck it to run only the OSS operation. CLI callers can pass `-f include_pro=false` to opt out for a single run. No repository-level enable variable is needed; the former `PRO_RELEASE_FOLLOW_OSS` variable is no longer read and can be removed if it was configured.

An OSS beta or stable workflow triggers its Pro counterpart only after npm publishing, the merge back, and the OSS GitHub Release all succeed, and only when the publish plan contained at least one real package publication. Dry runs, failed releases, tag-only or empty publish plans, legacy stable releases, and reruns that find everything already published do not start a Pro release even when `include_pro` is checked. A successful OSS promotion similarly passes the exact new OSS `main` commit to the Pro promotion; this promotes versions and merges branches without publishing packages. The standalone Pro workflows remain available for independent releases and dry runs.

`nocobase/nocobase3-pro` must have `develop` and `main` branches before promotion or stable release. It is valid for a newly created `main` branch to retain prerelease state initially: run **Promote Pro Beta to Stable** to remove that state and prepare stable versions before running **Release Pro Stable**.
