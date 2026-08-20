import fs from "node:fs";
import path from "node:path";

const distBinDir = path.join(process.cwd(), "dist", "node_modules", ".bin");

fs.rmSync(distBinDir, { recursive: true, force: true });
