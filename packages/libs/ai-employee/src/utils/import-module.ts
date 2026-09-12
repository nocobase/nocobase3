import { pathToFileURL } from 'node:url';

export async function importModule(m: string): Promise<any> {
  if (
    m.startsWith('./') ||
    m.startsWith('../') ||
    m.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(m)
  ) {
    m = pathToFileURL(m).href;
  }
  const r = await import(/* @vite-ignore */ m);
  const mod = (r && r.default !== undefined ? r.default : r) as any;
  return mod?.__esModule ? mod.default : mod;
}
