import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = resolve(root, "portal-sdk/src/files/generated/files-v1.ts");
const before = await readFile(output, "utf8");
const result = spawnSync(
  process.execPath,
  [resolve(root, "portal-sdk/scripts/generate-files-types.mjs")],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const generated = await readFile(output, "utf8");
if (!generated.startsWith("// DO NOT EDIT."))
  throw new Error("Invalid generated files types");
if (generated !== before)
  throw new Error(
    "Generated Files OpenAPI types are stale; run pnpm files:generate",
  );
