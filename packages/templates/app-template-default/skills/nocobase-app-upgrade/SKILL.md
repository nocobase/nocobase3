---
name: nocobase-app-upgrade
description: >-
  Upgrade this application to a newer release of the template it was generated
  from. Use when the user asks to upgrade the template, pull in template
  changes, move to a newer template version, or reconcile the application with
  upstream. Do not use for ordinary feature development or for upgrading a
  single dependency.
metadata:
  short-description: Merge a newer template release into this application
---

# Upgrading the application template

`pnpm create @nocobase/app` copied a template into the user's hands and left no link back to it, so a newer template release arrives only by someone merging it in.

The difficulty is telling the template's changes from the user's. Comparing the application against the latest template cannot: a file that differs may have been changed by either side, or both. So compare the two template _releases_ instead — the baseline already merged and the target — and decide file by file how each of their differences lands here.

```text
BASE     nocobase.defaultTemplateVersion — the release already merged in
TARGET   the release being moved to
PROJECT  the application as the user has it now

BASE → TARGET    what the template changed — the work to bring in
BASE → PROJECT   what the user changed — the work that must survive
```

`defaultTemplateVersion` is not the application's `version`. It records how far template source has been merged, and moves only after a merge actually happens.

The diff is information. Decide each file yourself and write every edit by hand — a text-merge tool applied to the project would reconcile only what its hunks happen to touch, leaving the user's own files unexamined and step 5 undone.

Never: overwrite the application with a fresh template copy; bump `defaultTemplateVersion` without merging the source; resolve a conflict by discarding the user's side; run `git checkout --`, `git restore`, `git reset --hard`, `git stash`, `git clean`, or `rm -rf` against the working tree; regenerate with `create-app` and copy the user's code across.

## 1. Secure a way back

Git project: require a clean tree (ask the user to commit anything outstanding — do not stash or commit it for them), record `git rev-parse HEAD`, then `git checkout -b template-upgrade-<target>`. Editing the project directly is safe on a branch, and it is what lets `typecheck`/`test`/`build` actually run.

Not a Git project: do not touch it. Offer `git init` plus a commit, or a full copy in a scratch directory to upgrade and verify before moving back. Never proceed with no way back.

## 2. Identify the source

```bash
node -p "JSON.stringify(require('./package.json').nocobase, null, 2)"
```

`templatePackage` names the template; `defaultTemplateVersion` is BASE. If `templatePackage` is missing the application predates the field: assume `@nocobase/app-template-default`, the `create-app` default, but confirm before fetching — `templateKind` reads `app` for both Default and Examples. The published version lines usually settle it (`npm view <pkg> versions --registry=https://npm.nocobase.ai`), and Examples is recognizable by its `app-plugin-*-example` registrations. If `defaultTemplateVersion` itself is missing or was bumped without a merge, the baseline is unknown — work it out with the user from Git history rather than guessing, since too old a baseline replays changes already present and too new a one skips changes never applied.

## 3. Fetch both releases

```bash
REGISTRY=https://npm.nocobase.ai
TEMPLATE=$(node -p "require('./package.json').nocobase.templatePackage")
BASE=$(node -p "require('./package.json').nocobase.defaultTemplateVersion")
TARGET=<target version>
WORK=$(mktemp -d)

for VERSION in "$BASE" "$TARGET"; do
  npm pack "$TEMPLATE@$VERSION" --registry="$REGISTRY" --pack-destination "$WORK" >/dev/null
  mkdir -p "$WORK/$VERSION"
  tar -xzf "$WORK"/*"-$VERSION.tgz" -C "$WORK/$VERSION" --strip-components=1
done
```

These are published tarballs, not Git checkouts — they carry only what `files` publishes, and npm never publishes `.gitignore`. That is fine: both sides are missing the same things.

Do not read the `beta` dist-tag as "newest". While every release is a prerelease, changesets tags each one `latest` and leaves `beta` on the first version ever published.

## 4. Read what changed, and who else changed it

```bash
diff -rq "$WORK/$BASE" "$WORK/$TARGET"
```

`Files ... differ` is modified, `Only in TARGET` added, `Only in BASE` removed. Read the substantive ones with `diff -u`, and read the target's `MIGRATION.md` — it carries steps no diff can show.

Then ask the project which of those files it has also touched:

```bash
diff -rq "$WORK/$BASE" "$WORK/$TARGET" \
  | sed -n "s|^Files $WORK/$BASE/\(.*\) and .* differ$|\1|p" \
  | while read -r file; do
      if [ ! -f "$file" ]; then echo "gone:      $file"
      elif diff -q "$WORK/$BASE/$file" "$file" >/dev/null; then echo "untouched: $file"
      else echo "modified:  $file"; fi
    done
```

Show the user this listing, the version range, whatever `MIGRATION.md` requires by hand, the removals from step 5, and the rollback. Get agreement before editing.

## 5. Check what the diff cannot show

Do this before editing, so its findings are in the plan. The template's files are consistent with each other after a change; the user's are not, and no diff points at them.

```bash
# For each `Only in BASE` file, and each export that vanished from a surviving file:
grep -hE '^export ' "$WORK/$BASE/<removed-file>"
diff -u "$WORK/$BASE/<file>" "$WORK/$TARGET/<file>" | grep -E '^-\s*export '

# Then search the user's own code for every name found:
grep -rn "<name>" client server cli database tests --include='*.ts' --include='*.tsx'
```

A hit outside the template's own files is a decision: migrate to the replacement the target added, agree with the user on what replaces a capability deliberately removed, or keep the file as application-owned code and say the template no longer maintains it. Changed signatures are the same class of problem — `pnpm typecheck` in step 8 is what catches those.

## 6. Work through the files

For each file read three versions — `$WORK/$BASE/<file>`, `$WORK/$TARGET/<file>`, and the project's — then write the result with Edit.

- **Untouched by the user** — take the template's version. Most of the list; fast, but still a decision, and `client/components/ui/` shadcn primitives belong here.
- **Both changed it** — express what the template was trying to achieve inside the user's version. Their code exists for a reason, so this is a merge of two intents, not a choice between them. If the template's change makes their customization unnecessary, say so rather than deleting it.
- **Template added a file** — copy it in; if something already exists at that path, reconcile rather than overwrite.
- **Template removed a file** — only after step 5.

Three files legitimately differ from both releases because the generator rewrote the template's package name into them: `client/runtime.ts`, `client/service-provider.ts`, `server/providers/app-example.ts`. Keep the application's name when taking a change there — copying verbatim splits the i18n namespace and fails `pnpm client:inspect`.

When the right answer is unclear, stop and ask. The user is the only one who knows why their code is the way it is.

## 7. Reconcile what is not ordinary source

`package.json`, `config.yml`, and the plugin composition roots have their own rules — see [edge cases](references/edge-cases.md).

## 8. Finish

Set `defaultTemplateVersion` to the target, now that the source is actually merged.

```bash
pnpm install && pnpm plugin:skills:sync
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

`typecheck` is doing real work here — it catches the broken import a removal left behind. Then run the application and check what the delta touched: sign-in, the user's pages, navigation, locale switching, any new migration. Passing commands are not evidence the application still behaves.

Report the range merged, how each contested file was decided, the manual steps `MIGRATION.md` required, and how to roll back.

## Crossing several releases

Go to the newest directly — stepping one release at a time means deciding the same file repeatedly. But read `MIGRATION.md` for the whole range: every section between the two versions applies, and manual steps appear in no diff.
