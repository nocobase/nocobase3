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

This application was generated from a published template package by `pnpm create @nocobase/app`. The source was copied into the user's hands at that moment and has been theirs ever since — there is no live link back to the template, so a newer template release reaches this application only by someone merging it in. That someone is you.

The whole difficulty is telling the template's changes apart from the user's. A file that differs from the latest template may have been changed by the template, by the user, or by both, and the three need opposite treatment. Comparing the application against the latest template cannot distinguish them, and an upgrade built on that comparison silently reverts the user's work.

So this Skill compares the two template releases against each other — the baseline the application already carries and the target it is moving to. That comparison is **information, not a patch**. You read it to learn what the template changed and why, then decide file by file how each change lands in this application, and make every edit yourself.

## Do not apply the diff as a patch

`git apply`, `patch`, and three-way merge tools match text. They know nothing about this application. That makes them wrong for this job in both directions:

**They report conflicts that are not conflicts.** A hunk rejects because the user added a line nearby. Nothing is actually in conflict; the tool simply lost its context.

**They stay silent on the damage that matters.** The template deletes `client/shell/navigation.ts` because a new mechanism replaced it. A user component imports `HOME_NAVIGATION_ITEM` from it. `git apply` deletes the file, reports success, exits `0` — and the application no longer compiles. The user's file was never examined, because no hunk touched it.

That second case is the one this Skill exists to prevent, and it is exactly what a clean patch run hides. **A tool reporting no conflicts is not evidence that the upgrade is safe.** Treat silence from any text-merge tool as meaningless here.

So: read the diff, understand each change, and write each edit with Edit. Never run `git apply`, `patch`, or `git merge` against the user's tree to perform the upgrade.

## The three trees

```text
BASE      the template release this application already carries
          = nocobase.defaultTemplateVersion in package.json

TARGET    the template release being moved to
          = a published version of nocobase.templatePackage

PROJECT   this application, as the user has it now
```

`BASE → TARGET` is what the template changed — the work to be brought in. `BASE → PROJECT` is what the user changed — the work that must survive. Every decision below comes from holding those two next to each other.

`nocobase.defaultTemplateVersion` is not the application's `version`. The application's version is the user's to set and means nothing here. `defaultTemplateVersion` means exactly one thing: the template release whose source has already been merged in. It moves only after the merge is actually done.

## Never do these

- **Never overwrite the application with a fresh template copy.** Not a directory, not a file "the user surely has not touched". Every file in this application is the user's.
- **Never run `git apply`, `patch`, or a merge tool against the project.** See above.
- **Never bump `defaultTemplateVersion` without merging the corresponding source.** The field then lies, and the next upgrade computes its delta from a baseline that was never applied — silently skipping every change in between.
- **Never resolve a conflict by discarding the user's side.** Stop and ask.
- **Never run `git checkout --`, `git restore`, `git reset --hard`, `git stash`, `git clean`, or `rm -rf` against the working tree.** They discard uncommitted work indiscriminately.
- **Never regenerate the project with `pnpm create @nocobase/app` and copy the user's code across.** That inverts ownership: it makes the template authoritative and the user's application the thing being patched in.

## The upgrade

### 1. Establish the workspace and the way back

Nothing else happens until the user's current state can be restored.

**If this is a Git repository:** require a clean working tree. If there is uncommitted work, ask the user to commit it — do not stash it, and do not commit it for them without being asked. Then work on a branch of its own:

```bash
git status --short                       # must be empty
git rev-parse HEAD                       # the rollback point; record it
git checkout -b template-upgrade-<target>
```

The branch is what makes it safe to edit the project directly: the upgrade is isolated, `git diff` shows exactly what the upgrade did, and abandoning it is `git checkout -` plus deleting the branch.

**If this is not a Git repository:** there is no way back, so do not touch the project. Offer the user the two options and let them choose:

- Run `git init` and commit the current state first, then proceed as above. This is the better answer and takes seconds.
- Work in a copy: copy the whole project to a scratch directory, upgrade and verify there, and move it back only once it passes. Slower — the copy needs its own `pnpm install` before anything can be verified — but it leaves the original untouched throughout.

Do not proceed on an unversioned project with no backup, whatever the user says about the changes being small.

### 2. Read where the application stands

```bash
node -p "JSON.stringify(require('./package.json').nocobase, null, 2)"
```

```json
{
  "templateKind": "app",
  "templatePackage": "@nocobase/app-template-default",
  "defaultTemplateVersion": "1.0.0-beta.21"
}
```

`templatePackage` names the template to compare. If it is absent — the application predates the field — do not guess. See [identifying the source template](references/identify-source.md).

### 3. Fetch both releases and read what changed

See [reading the template delta](references/compute-delta.md). In outline: `npm pack` both versions from the registry, extract them side by side, and read the differences.

Two things come out of this step, and the upgrade is planned from both:

- **What the template changed**, file by file, and why.
- **Which of those files the user also changed** — `diff BASE/<file> <file>` for each. This is what separates a mechanical edit from a judgement call.

Read the target's `MIGRATION.md` in the same step. It carries the instructions the template author wrote for exactly this merge, including steps no diff can show.

### 4. Plan, and get it approved

Present to the user: the version range, every file the template changed and which of them the user also touched, anything `MIGRATION.md` requires by hand, the removals that put existing code at risk (step 6), and the rollback. Do not edit the application until they agree.

### 5. Work through the files

Go file by file. For each one, read three things — the file in BASE, the same file in TARGET, and the application's current version — then write the result with Edit. See [deciding each file](references/apply-and-resolve.md) for how to classify a file and what each class needs.

Do not batch-copy files, even ones that appear untouched. Verifying a file is unmodified takes one `diff`, but deciding to take the template's version is still a decision — a file identical to BASE can still be one the target release changes in a way that breaks the user's code elsewhere.

### 6. Check what no diff can show

The template's changes reach beyond the files it touches. A removed export, a renamed module, a changed signature — the template's own files are consistent afterwards, and the user's are not. Nothing in the diff points at the user's file, so this check is the only thing between a "clean" upgrade and a broken application.

See [deciding each file](references/apply-and-resolve.md#what-the-diff-cannot-show) for the checks. Run them before declaring the merge done.

### 7. Reconcile what is not source

`package.json`, `config.yml`, and the plugin composition roots follow their own rules. See [the manifest, config, and plugin roots](references/manifest-and-config.md).

### 8. Finish

Set `defaultTemplateVersion` to the target — now, after the source is merged, and not before. Then:

```bash
pnpm install
pnpm plugin:skills:sync
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm typecheck` is doing real work here, not ceremony: it is what catches the broken import left by a removal the diff never mentioned. Treat a failure as an unfinished upgrade rather than a problem to work around.

Then run the application and check what the delta touched: sign-in, the pages the user owns, navigation, locale switching, and any migration the target introduced. Passing commands are not evidence the application still behaves.

Report the version range merged, the files changed and how each was decided, every judgement call and its reasoning, the manual steps `MIGRATION.md` required, and how to roll back.

## Crossing several releases at once

Go to the newest release directly. `BASE → TARGET` across a range is a single comparison, and stepping through releases one at a time means deciding the same file repeatedly as successive versions rewrite it.

Read `MIGRATION.md` for the whole range, though. Every section between the two versions applies, and a section describing a manual step appears in no diff at all.
