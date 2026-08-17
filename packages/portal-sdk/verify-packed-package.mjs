import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = path.dirname(fileURLToPath(import.meta.url));

const packageRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : undefined;

if (!packageRoot) {
  throw new Error("Usage: node verify-packed-package.mjs <unpacked-package>");
}

const packagePath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const exportsMap = packageJson.exports;
const workspacePackage = JSON.parse(
  fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8")
);
const workspaceExports = workspacePackage.exports;

if (!exportsMap || typeof exportsMap !== "object") {
  throw new Error("Packed Portal SDK does not declare package exports.");
}

if (!workspaceExports || typeof workspaceExports !== "object") {
  throw new Error("Workspace Portal SDK does not declare package exports.");
}

const workspaceEntryPoints = Object.keys(workspaceExports).sort();
const packedEntryPoints = Object.keys(exportsMap).sort();

if (JSON.stringify(workspaceEntryPoints) !== JSON.stringify(packedEntryPoints)) {
  throw new Error(
    "Workspace and packed Portal SDK entry points do not match."
  );
}

for (const [entryPoint, conditions] of Object.entries(workspaceExports)) {
  for (const condition of ["import", "types"]) {
    const target = conditions?.[condition];
    if (typeof target !== "string" || !target.startsWith("./src/")) {
      throw new Error(
        `Workspace export ${entryPoint}.${condition} must target src, received ${String(target)}.`
      );
    }

    if (!fs.existsSync(path.resolve(sdkRoot, target))) {
      throw new Error(
        `Workspace export ${entryPoint}.${condition} target does not exist: ${target}`
      );
    }
  }
}

for (const [entryPoint, conditions] of Object.entries(exportsMap)) {
  if (!conditions || typeof conditions !== "object") {
    throw new Error(`Packed export ${entryPoint} must declare import and types.`);
  }

  for (const condition of ["import", "types"]) {
    const target = conditions[condition];
    if (typeof target !== "string" || !target.startsWith("./dist/")) {
      throw new Error(
        `Packed export ${entryPoint}.${condition} must target dist, received ${String(target)}.`
      );
    }

    if (!fs.existsSync(path.resolve(packageRoot, target))) {
      throw new Error(
        `Packed export ${entryPoint}.${condition} target does not exist: ${target}`
      );
    }
  }
}

if (fs.existsSync(path.join(packageRoot, "src"))) {
  throw new Error(
    "Packed Portal SDK must not contain the workspace src directory."
  );
}

process.stdout.write(
  `Verified ${Object.keys(exportsMap).length} packed Portal SDK exports.\n`
);
