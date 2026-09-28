// The package's own name, so that this resolves to `src` in a checkout and to `dist` once published.
import type { CommandFailureJson } from '@nocobase/cli-envelope';

export const MINIMUM_NODE_MAJOR_VERSION: 24;

export function getNodeMajorVersion(version?: string): number;

export function isSupportedNodeVersion(
  version?: string,
  minimum?: number,
): boolean;

export function formatUnsupportedNodeVersionMessage(
  name: string,
  version?: string,
  minimum?: number,
): string;

export function unsupportedNodeVersionEnvelope(
  command: string,
  version?: string,
  minimum?: number,
): CommandFailureJson;

export interface UnsupportedNodeVersionOutputOptions {
  /** The tool's name, as the message on stderr prefixes it. */
  readonly name: string;
  /** What the document's `command` names. */
  readonly command: string;
  /** The arguments the tool was run with; `--json` among them selects the document. */
  readonly argv: readonly string[];
  readonly version?: string;
  readonly minimum?: number;
  /** Indentation for the document, for a tool that prints its documents indented; one line by default. */
  readonly indent?: number;
}

export function unsupportedNodeVersionOutput(
  options: UnsupportedNodeVersionOutputOptions,
): { readonly stream: 'stdout' | 'stderr'; readonly text: string };

export function exitWhenFlushed(code: number): Promise<never>;
