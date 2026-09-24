import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface BuildHubEnvOptions {
  /** Contents of the template's `.env.example`, copied so its comments and optional keys reach the user. */
  example?: string;
}

/**
 * Builds the `.env` a generated hub starts with.
 *
 * A hub is an application like any other — it owns a database, registers plugins, and takes its secrets from
 * `config.yml`. What it has in addition is a deployment identity: the path it is mounted at, from which its name
 * follows. That is an environment fact rather than an application setting, so it lives in `.env`. The template ships
 * `.env.example` but not `.env`, and nothing reads the example, so a hub generated without this step runs entirely on
 * defaults with no file to edit.
 *
 * The example is copied as it is. `APP_BASE_PATH` deliberately stays at the template's `/hub`: a hub is a fixed piece
 * of infrastructure at a known address, and a deployment that wants it elsewhere sets the value itself.
 */
export function buildHubEnvFile(options: BuildHubEnvOptions = {}): string {
  return `${(options.example ?? FALLBACK_HUB_ENV).trimEnd()}\n`;
}

/**
 * Written when the template ships no `.env.example`, so a generated hub is never left without the setting that places
 * it.
 */
const FALLBACK_HUB_ENV = ['# Application', 'APP_BASE_PATH=/hub', ''].join('\n');

/** Reads the template's `.env.example`, which a template is not required to ship. */
export async function readEnvExample(
  directory: string,
): Promise<string | undefined> {
  try {
    return await readFile(path.join(directory, '.env.example'), 'utf8');
  } catch {
    return undefined;
  }
}
