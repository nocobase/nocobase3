import spawn from "cross-spawn";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

const run = (label, command, args) => {
  console.log(`\n> ${label}`);

  const result = spawn.sync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

fs.rmSync(distDir, { recursive: true, force: true });

run("Typecheck client", "pnpm", ["exec", "tsc"]);
run("Typecheck tooling", "pnpm", ["exec", "tsc", "-p", "tsconfig.node.json"]);
run("Build client", "pnpm", ["exec", "refine", "build"]);
run("Build server", "pnpm", ["exec", "tsc", "-p", "tsconfig.server.json"]);
run("Generate server package", "node", ["./scripts/build-server-dist-package.mjs"]);
run("Install server production dependencies", "npm", [
  "install",
  "--omit=dev",
  "--package-lock=false",
  "--prefix",
  "./dist",
]);
run("Clean server dependency bins", "node", ["./scripts/clean-dist-bin.mjs"]);

console.log("\nBuild complete: dist/client, dist/server, and dist/package.json");
