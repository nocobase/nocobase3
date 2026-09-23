---
'@nocobase/app-server': patch
'@nocobase/app-tools': minor
---

Stop `pnpm dev` and `pnpm start` before they launch an application that has nowhere to read its configuration from, and say how to create one.

Without configuration the server throws on startup, which `pnpm dev` then hides: it runs the server under `tsx watch`, which prints the error and waits for a file to change rather than exiting, while Vite carries on and prints a URL. The command looks like it succeeded, exits with nothing, and the page it points at has no API behind it. The check runs before anything is spawned and names `pnpm config:init`.

What it checks is that a configuration source exists, not that its contents are valid — a file beside the application, a path in `APP_CONFIG_FILE`, or `AUTH_SECRET` in the environment or a `.env` file all count, so an application configured entirely through the environment still starts. Validity stays with the runtime, which already reports a placeholder secret, a missing `auth.secret` and a dialect with no driver, each with the key and the command that fixes it.

`build` is deliberately left alone: compiling the client and server, generating `dist/package.json` and installing production dependencies never reads a secret, and requiring one there would break both an application's own `pnpm check` and any image build that builds before its configuration exists.

The missing-driver error now says to add the driver to the application's dependencies and to build a deployment again afterwards, rather than implying it can be installed wherever the error appeared — in a deployment that runs from a built `dist`, installing one there is undone by the next build.
