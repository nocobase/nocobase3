# Release identity and CI skipping

OSS beta releases, stable releases, and beta-to-stable promotion create their Git commits as `nocobase[bot] <179432756+nocobase[bot]@users.noreply.github.com>`. The numeric user ID was verified through the GitHub `users/nocobase[bot]` endpoint. This is the bot account ID, not the App ID (`979192`) or installation ID. The Pro workflows hosted here use the same verified Git identity.

Configure the existing `NOCOBASE_APP_ID` Actions variable and `NOCOBASE_APP_PRIVATE_KEY` secret in `nocobase/nocobase3`. The existing `nocobase` GitHub App must be installed on this repository with Contents, Pull requests, and Workflows write permissions. These are the same App credentials used by the Pro release workflows; no additional PAT or bot server deployment is required.

Source checkouts use the workflow's read-only `GITHUB_TOKEN` without retaining its credentials in the release source checkout. After validation, each writing job mints an installation token scoped to `nocobase3` and uses it for branch and tag pushes, PR creation, and PR merging. Minting the write token after long-running validation preserves its one-hour lifetime. The separate GitHub Release job obtains its own fresh App token, so new Releases are also created by `nocobase[bot]`. Dry runs do not mint write tokens or write remotely.

## Generated commits do not start another CI run

App-authenticated writes can trigger workflows, unlike writes made with the default `GITHUB_TOKEN`. Generated release candidates and sync commits carry `[skip ci]`. The generated PR title and the explicit `gh pr merge --subject` also carry `[skip ci]`, because the GitHub-generated merge commit does not inherit the candidate commit's message. This covers release metadata merged back into `develop` or the selected stable branch, promotion merged into `main`, and the subsequent sync back into `develop`.

GitHub honors the marker for the repository's native `push` and `pull_request` workflows: Quality, Changeset Check, Docs, and Guard Main. It does not stop the already-running release, `workflow_dispatch`, or `workflow_call`, so GitHub Release creation, Hub image publication, and requested Pro follow-up jobs continue through their explicit dependencies. If a maintainer merges a generated PR manually, retain `[skip ci]` in the final merge commit message.

Skipping does not create a successful check result. A future branch rule requiring these checks would need a separate policy for generated release PRs; do not enable a blanket bypass or suppress ordinary contributor CI based only on actor identity. Pro checks forwarded by the separate bot server are webhook-driven and are not disabled by GitHub's native skip marker. This change does not modify that server's dispatch rules.

The change applies to future commits and Releases; it does not rewrite existing release history or change the author of an already-created GitHub Release.
