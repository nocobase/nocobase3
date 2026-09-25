// Works out which application a run belongs to, if any.
//
// The answer comes from the nearest `package.json` above the starting directory, because that is the file every
// command then reads and edits. An application is marked by its `nocobase` field: a source checkout carries
// `nocobase.templateKind`, which the templates and `create-app` write, and a built `dist/` carries
// `nocobase.buildTarget`, which the build writes. A directory with neither — this repository's root, or a plugin
// package — is no application, and only the commands that take their target from a flag run there.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { AppLocationKind } from './builtin.ts';

export interface AppLocation {
  readonly kind: AppLocationKind;
  /** The directory holding the `package.json` that decided `kind`; the starting directory when none was found. */
  readonly root: string;
  /** `nocobase.cli.publishing` from that `package.json`. */
  readonly publishing: boolean;
}

interface NocoBaseManifest {
  readonly nocobase?: {
    readonly templateKind?: unknown;
    readonly buildTarget?: unknown;
    readonly cli?: { readonly publishing?: unknown };
  };
}

/** The application containing `start`, found by walking up to the nearest `package.json`. */
export function locateApp(start: string): AppLocation {
  const from = path.resolve(start);
  for (let directory = from; ; directory = path.dirname(directory)) {
    const manifestPath = path.join(directory, 'package.json');
    if (existsSync(manifestPath)) {
      return describeRoot(directory, readManifest(manifestPath));
    }
    if (path.dirname(directory) === directory) {
      return { kind: 'none', root: from, publishing: false };
    }
  }
}

/** The application whose root is exactly `root`, for an entry point that already knows where it lives. */
export function appAt(root: string): AppLocation {
  const directory = path.resolve(root);
  const manifestPath = path.join(directory, 'package.json');
  return describeRoot(
    directory,
    existsSync(manifestPath) ? readManifest(manifestPath) : {},
  );
}

function describeRoot(root: string, manifest: NocoBaseManifest): AppLocation {
  const nocobase = manifest.nocobase;
  const publishing = nocobase?.cli?.publishing === true;
  if (nocobase?.buildTarget !== undefined) {
    return { kind: 'deployment', root, publishing };
  }
  if (nocobase?.templateKind !== undefined) {
    return { kind: 'source', root, publishing };
  }
  return { kind: 'none', root, publishing: false };
}

function readManifest(manifestPath: string): NocoBaseManifest {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as NocoBaseManifest;
  } catch (cause) {
    throw new Error(`Could not read ${manifestPath}.`, { cause });
  }
}
