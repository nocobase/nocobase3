# Running Pro releases from the open-source repository

The open-source repository hosts three workflows that operate on `nocobase/nocobase3-pro`: **Release Pro Beta**, **Promote Pro Beta to Stable**, and **Release Pro Stable**. They use public-repository Actions minutes, but all generated branches, tags, pull requests, GitHub Releases, and npm packages belong to the private Pro repository. The jobs do not upload commercial source, package tarballs, or smoke-test logs as Actions artifacts.

Each workflow can be started manually. `oss_sha` may be left empty for a manual run; the job resolves the matching OSS branch once and freezes that commit for the whole run. Calls made by the OSS release workflows always pass their exact tested and published commit so the Pro release cannot drift to a later branch tip.

Set the following in the `nocobase/nocobase3` repository before running these workflows:

| Setting                    | Kind             | Purpose                                                              |
| -------------------------- | ---------------- | -------------------------------------------------------------------- |
| `NOCOBASE_APP_ID`          | Actions variable | App ID for the `nocobase` GitHub App                                 |
| `NOCOBASE_APP_PRIVATE_KEY` | Actions secret   | Private key for that App                                             |
| `PRO_NPM_TOKEN`            | Actions secret   | Publishes commercial packages to `https://npm.nocobase.ai`           |
| `FEISHU_WEBHOOK`           | Actions secret   | Existing release notification webhook                                |
| `PRO_RELEASE_FOLLOW_OSS`   | Actions variable | Set to the literal `true` to enable automatic Pro follow-up releases |

The GitHub App must be installed on `nocobase/nocobase3-pro`. Its installation token needs repository Contents, Pull requests, and Workflows write access there; Workflows permission is needed when a promotion carries workflow changes from Pro `develop` into `main`. The workflow's own `GITHUB_TOKEN` has read-only access to the OSS repository and is never used to write the private repository. A read token is created for checkout, then a fresh write token is created after build and test because installation tokens expire after one hour.

Automatic follow-up is disabled unless `PRO_RELEASE_FOLLOW_OSS` is `true`. An OSS beta or stable workflow triggers its Pro counterpart only after npm publishing, the merge back, and the OSS GitHub Release all succeed, and only when the publish plan contained at least one real package publication. Dry runs, failed releases, tag-only or empty publish plans, legacy stable releases, and reruns that find everything already published do not start a Pro release. A successful OSS promotion similarly passes the exact new OSS `main` commit to the Pro promotion.

`nocobase/nocobase3-pro` must have `develop` and `main` branches before promotion or stable release. It is valid for a newly created `main` branch to retain prerelease state initially: run **Promote Pro Beta to Stable** to remove that state and prepare stable versions before running **Release Pro Stable**.
