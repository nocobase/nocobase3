import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repo, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("pnpm", ["--filter", "@nocobase/files", "openapi:generate"]);
run("pnpm", ["--filter", "@nocobase/portal-sdk", "files:generate"]);
run("git", ["diff", "--exit-code", "--", "packages/files/openapi/files-v1.json", "packages/portal-sdk/src/files/generated/files-v1.ts"]);

const document = JSON.parse(await readFile(resolve(repo, "packages/files/openapi/files-v1.json"), "utf8"));
const operations = Object.entries(document.paths).flatMap(([path, methods]) => Object.entries(methods).filter(([, operation]) => operation.operationId).map(([method, operation]) => ({ method: method.toUpperCase(), path, operationId: operation.operationId })));
if (new Set(operations.map(operation => operation.operationId)).size !== operations.length) throw new Error("Files operationIds must be unique");

const { FILES_ROUTES } = await import(pathToFileURL(resolve(repo, "packages/files/dist/contracts/routes.js")));
const runtime = Object.values(FILES_ROUTES).map(route => `${route.method} ${route.path.replace(/:([^/]+)/g, "{$1}")} ${route.operationId}`).sort();
const openapi = operations.filter(operation => operation.operationId !== "filesDeliverLocalFile").map(operation => `${operation.method} ${operation.path} ${operation.operationId}`).sort();
if (JSON.stringify(runtime) !== JSON.stringify(openapi)) throw new Error(`Files routes and OpenAPI paths differ\nRuntime: ${runtime.join("\n")}\nOpenAPI: ${openapi.join("\n")}`);

const sdkTypes = await readFile(resolve(repo, "packages/portal-sdk/src/files/types.ts"), "utf8");
if (!sdkTypes.includes('operations["filesGetConfig"]') || !sdkTypes.includes('operations["filesCreateUpload"]')) throw new Error("Portal SDK public types must derive from generated OpenAPI operations");

const registryRoot = resolve(repo, "packages/app-template-default/registry");
const itemRoots = ["nocobase-file-upload", "nocobase-file-preview", "nocobase-attachment-field", "nocobase-files-example"];
let sdkImports = 0;
for (const item of itemRoots) {
  for (const entry of await readdir(resolve(registryRoot, item), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const source = await readFile(resolve(entry.parentPath, entry.name), "utf8");
    if (source.includes("@nocobase/files") || /from ["'][^"']*(contracts|generated\/files-v1)["']/.test(source)) throw new Error(`${item}/${entry.name} imports server or copied Files contracts`);
    if (source.includes("@nocobase/portal-sdk/files")) sdkImports++;
  }
}
if (!sdkImports) throw new Error("Registry Files items must import @nocobase/portal-sdk/files");
console.log(`Files contracts are current: ${operations.length} operations, ${sdkImports} Registry SDK imports.`);
