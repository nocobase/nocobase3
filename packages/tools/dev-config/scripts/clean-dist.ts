import { rm } from 'node:fs/promises';
import path from 'node:path';

const packageRoot: string = path.resolve(import.meta.dirname, '..');

await rm(path.join(packageRoot, 'dist'), { force: true, recursive: true });
