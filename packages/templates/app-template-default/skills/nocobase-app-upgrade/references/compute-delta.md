# Reading the template delta

The delta is `BASE → TARGET`: what changed between the template release the application already carries and the one it is moving to. It is computed from the two published tarballs, entirely outside the project.

It is read, not applied. Nothing in this reference modifies the application, and no command here should ever be pointed at it.

## Where the releases come from

The templates are published to the self-hosted registry rather than the public npm, and there is no public Git repository to clone. `npm pack` is how a release is obtained:

```bash
REGISTRY=https://npm.nocobase.ai
TEMPLATE=$(node -p "require('./package.json').nocobase.templatePackage")
BASE=$(node -p "require('./package.json').nocobase.defaultTemplateVersion")
```

Confirm the target before fetching. `latest` is the newest published release:

```bash
npm view "$TEMPLATE" dist-tags --registry="$REGISTRY"
npm view "$TEMPLATE" versions --registry="$REGISTRY"
```

Do not read the `beta` dist-tag as "newest". While every published version is a prerelease, changesets tags each release `latest` and leaves `beta` on the first version ever published, so `beta` names the oldest release rather than the newest.

## Extracting both releases

Work in a scratch directory outside the project, so nothing lands in the user's tree by accident:

```bash
TARGET=1.0.0-beta.24
WORK=$(mktemp -d)

for VERSION in "$BASE" "$TARGET"; do
  npm pack "$TEMPLATE@$VERSION" --registry="$REGISTRY" --pack-destination "$WORK" >/dev/null
  mkdir -p "$WORK/$VERSION"
  tar -xzf "$WORK"/*"-$VERSION.tgz" -C "$WORK/$VERSION" --strip-components=1
done
```

Both directories now hold the template exactly as published — the same content this application was generated from, which is what makes the comparison meaningful.

A tarball is not the template's Git checkout: it carries only what the package's `files` field publishes, and npm refuses to publish a file named `.gitignore`, so a template ships it under another name or not at all. This does not affect the comparison, since both sides are tarballs and are missing the same things.

## What the template changed

```bash
diff -rq "$WORK/$BASE" "$WORK/$TARGET"
```

That is the work list, and it is usually short — a typical release touches a handful of files, a large one a few dozen. It names three kinds of change, and the third is the one to slow down on:

```text
Files ... differ            modified — read both versions
Only in TARGET: ...         added — new file, or a replacement for something removed
Only in BASE: ...           removed — the dangerous one; see below
```

Read the substantive changes properly:

```bash
diff -u "$WORK/$BASE/<file>" "$WORK/$TARGET/<file>"
```

You are about to decide how each one lands in code the user has been editing. You cannot make that call on a file you have not read.

## What the user changed

The template's diff says nothing about this application. Ask the project directly, for each file the template touched:

```bash
diff -rq "$WORK/$BASE" "$WORK/$TARGET" \
  | sed -n "s|^Files $WORK/$BASE/\(.*\) and .* differ$|\1|p" \
  | while read -r file; do
      if [ ! -f "$file" ]; then
        echo "gone:      $file"
      elif diff -q "$WORK/$BASE/$file" "$file" >/dev/null; then
        echo "untouched: $file"
      else
        echo "modified:  $file"
      fi
    done
```

- `untouched` — the user never edited it. The template's version is very likely right, but it is still a decision; see [deciding each file](apply-and-resolve.md).
- `modified` — both sides changed it. Every one of these needs judgement.
- `gone` — the user deleted a file the template still maintains. Ask why before restoring it.

This listing is what makes the plan honest. Show it to the user before editing anything.

## `MIGRATION.md`

```bash
diff -u "$WORK/$BASE/MIGRATION.md" "$WORK/$TARGET/MIGRATION.md"
```

Its new sections are written for exactly this merge, and they describe what a source diff cannot: registrations to remove, providers to add, ordering that matters, and changes whose consequence for existing data needs a decision. A section may also say a change does not apply to every application — that judgement is yours to make and the user's to confirm.

There is no `CHANGELOG.md` in the tarball. `MIGRATION.md` and the diff itself are the record.

## Removals, before anything else

`Only in BASE` is where an upgrade breaks an application silently. The template removed a file; if the user's code imports from it, nothing in the diff says so, and every text-merge tool would report success.

List what each removed file exported, and search the project for it:

```bash
grep -hE '^export ' "$WORK/$BASE/<removed-file>"
grep -rn "<exported-name>" client server cli database tests --include='*.ts' --include='*.tsx'
```

Do the same for exports that disappeared from a file that still exists — a removal inside a surviving file is just as invisible:

```bash
diff -u "$WORK/$BASE/<file>" "$WORK/$TARGET/<file>" | grep -E '^-\s*export '
```

Every hit in the user's own code is a decision to make before the merge is called done, and it belongs in the plan you show the user. [Deciding each file](apply-and-resolve.md#what-the-diff-cannot-show) covers the options.
