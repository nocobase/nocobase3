import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = resolve(root, "files/openapi/files-v1.json");
const output = resolve(root, "portal-sdk/src/files/generated/files-v1.ts");
const document = JSON.parse(await readFile(source, "utf8"));
const generated = astToString(await openapiTS(document));

await writeFile(
  output,
  `// DO NOT EDIT. Generated from packages/files/openapi/files-v1.json.\n${generated}`,
);
