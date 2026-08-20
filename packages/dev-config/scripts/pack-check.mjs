import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const packDirectoryValue = process.env.PACK_DIR;

if (!packDirectoryValue) {
  throw new Error("PACK_DIR must be set before running pack:check.");
}

const packDirectory = path.resolve(packDirectoryValue);
const packageManifest = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const generatedArchiveName = `${packageManifest.name
  .replace(/^@/, "")
  .replaceAll("/", "-")}-${packageManifest.version}.tgz`;
const generatedArchive = path.join(packDirectory, generatedArchiveName);
const checkedArchive = path.join(packDirectory, "nocobase-dev-config.tgz");

const run = (command, args, cwd = packageRoot) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.`,
        ),
      );
    });
  });

await mkdir(packDirectory, { recursive: true });
await run("pnpm", ["pack", "--pack-destination", packDirectory]);
await copyFile(generatedArchive, checkedArchive);
await unlink(generatedArchive);
await run("pnpm", ["exec", "publint", "."]);
await run("pnpm", [
  "exec",
  "attw",
  checkedArchive,
  "--profile",
  "esm-only",
  "--entrypoints",
  "eslint",
  "prettier",
  "vitest/node",
  "vitest/react",
  "vitest/react-setup",
  "vite/portal",
]);
