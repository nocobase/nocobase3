# Deciding each file

The diff says what the template changed. What that means for this application is a separate question, answered file by file, and answered by you rather than by a merge tool.

Every edit in this step is one you write with Edit, into the user's file, having read all three versions. There is no command that does this part.

## The three versions to read

For any file under consideration:

```bash
diff -u "$WORK/$BASE/<file>" "$WORK/$TARGET/<file>"   # what the template did
diff -u "$WORK/$BASE/<file>" "<file>"                 # what the user did
```

The first says what change to bring in. The second says what it has to coexist with. Read both before touching the file; reading only the first is how a customization gets quietly reverted.

## Classify, then act

**The user never touched it** (`diff BASE/<file> <file>` is empty). Take the template's version. This is most of the list, and it is the fast path — but it is still a decision, not a batch operation. Two things still need a moment: whether the template's new version references something this application does not have, and whether the change is one the user would want to know about. Say what you took, do not narrate every file.

**Only the template changed it, but the user's copy differs from BASE.** They did edit it, just not in a way that shows up in the same region. Apply the template's change into their version by hand, keeping their edit. Do not copy the template's file over.

**Both changed the same region.** This is the real work. Read what the template was trying to achieve, then express that in the user's file. The user's version exists for a reason, so this is a merge of two intents rather than a choice between them. Three shapes cover most of it:

- Their change is orthogonal — keep both.
- They customized exactly what the template rewrote — reapply their customization on top of the new code, and say so in the report.
- The template's change makes their customization unnecessary, because the mechanism they worked around now exists — point this out rather than deciding unilaterally. Removing their code is theirs to approve.

**The template added a file.** Copy it in. If a file already exists at that path, the user created something with the same name — reconcile the two rather than overwriting.

**The template removed a file.** Never delete it on the strength of the diff alone. See below.

When the right answer is genuinely unclear, stop and ask. Leave both versions visible and describe the choice. Guessing here is how an upgrade quietly breaks business behavior, and the user is the only one who knows why their code is the way it is.

## What the diff cannot show

The template's own files are consistent with each other after a change. The user's files are not, and nothing in the diff points at them. These checks are the only thing standing between a clean-looking upgrade and a broken application — run them, and run them before declaring the merge done.

### A removed file the user imports

```bash
grep -hE '^export ' "$WORK/$BASE/<removed-file>"
grep -rn "<exported-name>" client server cli database tests \
  --include='*.ts' --include='*.tsx'
```

A hit in the user's own code means deleting the file breaks it. There are three honest answers, and which one applies depends on why the template removed it:

- **A replacement exists.** The target usually adds one — `MIGRATION.md` and the `Only in TARGET` list say what. Migrate the user's code to it.
- **The capability is gone deliberately.** Tell the user what they lose and agree on what replaces it. Do not invent a shim.
- **The user's use is legitimate and unaffected.** Keep the file as application-owned code, note that the template no longer maintains it, and say so in the report.

### An export removed from a file that survives

Just as invisible, and more common:

```bash
diff -u "$WORK/$BASE/<file>" "$WORK/$TARGET/<file>" | grep -E '^-\s*export '
```

Search each name the same way. A renamed export is the frequent case, and the fix is usually mechanical once you know it happened.

### A changed signature or contract

A function that gained a required parameter, a component that gained a required prop, a type that narrowed. The template updated every call site it owns; the user's call sites are not in the diff. `pnpm typecheck` catches most of these, which is why it is not optional at the end.

### Behavior the type checker cannot see

A changed default, a route that now redirects, a provider that must be registered before another. `MIGRATION.md` is where these are written down, and reading it is the only way to catch them.

## Files the generator rewrote

`pnpm create @nocobase/app` replaced the template's package name with this application's in three sources:

```text
client/runtime.ts
client/service-provider.ts
server/providers/app-example.ts
```

These files legitimately differ from both BASE and TARGET, and the difference is not the user's customization. When taking a template change here, keep the application's name. Copying the template's version verbatim reintroduces `@nocobase/app-template-default` and splits the i18n namespace between client and server — `pnpm client:inspect` fails on exactly this.

## Files the generator created

`config.yml`, `.gitignore`, and `pnpm-workspace.yaml` were written by the generator, not copied from the template. They are in neither tarball and appear in no diff. `config.yml` still needs attention when `config.example.yml` gains a key — see [the manifest, config, and plugin roots](manifest-and-config.md).

## Where the user's code lives

Business code and template structure sit in different places, and that separation is what makes these upgrades survivable:

```text
Almost always the user's — the template rarely changes these
  client/pages/           client/components/      client/locales/
  client/routes.ts        server/routes/          server/providers/
  database/               cli/commands/           tests/  e2e/

Template structure — where most of the delta lands
  client/routing/    client/shell/    client/layouts/    client/theme/
  server/app.ts      server/runtime.ts   server/standalone.ts   server/embedded.ts
  client/app.ts      client/runtime.ts   client/startup.tsx
  scripts/           vite.config.ts      vitest.config.ts     eslint.config.js
  tsconfig*.json     index.html          components.json

Both sides edit these — expect the hardest decisions here
  client/plugins.ts  server/plugins.ts  cli/plugins.ts
  package.json       config.example.yml
  AGENTS.md  CLAUDE.md  skills/
```

A template change landing in the first group is a signal, not a nuisance: the template does not usually reach there, so read it carefully and consider whether the user meant to own that file.

`client/components/ui/` is the exception in that group. Those are shadcn primitives, generated rather than written, so a template change to one is normally safe to take — unless the user customized it, which they are entitled to do.

## Documentation the template owns

`AGENTS.md`, `CLAUDE.md`, `MIGRATION.md`, `README.MD`, and `skills/` ship with the template and are updated by it. They are still the user's files, and the user may have appended to them.

Take the template's version where the user wrote nothing of their own; merge where they did. `skills/` matters more than it looks: it describes how to work in this application, and a stale copy sends the next agent — including your next session — down a path the application no longer supports.

`.agents/skills/` is different. It is generated, gitignored, and replaced wholesale by `pnpm plugin:skills:sync`. Never merge into it.
