import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distBinDir = path.join(rootDir, "dist", "node_modules", ".bin");

fs.rmSync(distBinDir, { recursive: true, force: true });
