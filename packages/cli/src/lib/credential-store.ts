import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentApplicationScope, AgentScope } from './hub-client.ts';
import { normalizeHubUrl } from './hub-client.ts';

export interface StoredCredential {
  hub: string;
  clientId?: string;
  credentialId: string;
  accessToken: string;
  accessTokenExpiresAt: number | null;
  refreshToken: string;
  refreshTokenExpiresAt: number | null;
  scopes: readonly AgentScope[];
  applicationScope: AgentApplicationScope;
}

interface CredentialFile {
  version: 1;
  hubs: Record<string, StoredCredential>;
}

export interface CredentialStorage {
  get(hub: string): Promise<StoredCredential | undefined>;
  set(credential: StoredCredential): Promise<void>;
  remove(hub: string): Promise<boolean>;
}

export function defaultCliRoot(): string {
  return path.resolve(
    process.env.NOCOBASE_CLI_ROOT?.trim() ||
      process.env.NB3_CLI_ROOT?.trim() ||
      path.join(os.homedir(), '.nocobase'),
  );
}

export class CredentialStore implements CredentialStorage {
  private readonly root: string;

  public constructor(root: string = defaultCliRoot()) {
    this.root = path.resolve(root);
  }

  public filePath(): string {
    return path.join(this.root, 'credentials.json');
  }

  public async get(hub: string): Promise<StoredCredential | undefined> {
    const file = await this.read();
    const credential = file.hubs[normalizeHubUrl(hub)];
    return credential ? structuredClone(credential) : undefined;
  }

  public async set(credential: StoredCredential): Promise<void> {
    const file = await this.read();
    const hub = normalizeHubUrl(credential.hub);
    file.hubs[hub] = { ...structuredClone(credential), hub };
    await this.write(file);
  }

  public async remove(hub: string): Promise<boolean> {
    const file = await this.read();
    const key = normalizeHubUrl(hub);
    if (!Object.hasOwn(file.hubs, key)) return false;
    delete file.hubs[key];
    await this.write(file);
    return true;
  }

  private async read(): Promise<CredentialFile> {
    let contents: string;
    try {
      contents = await readFile(this.filePath(), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, hubs: {} };
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (cause) {
      throw new Error(
        `Credential file "${this.filePath()}" is not valid JSON.`,
        {
          cause,
        },
      );
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as { version?: unknown }).version !== 1 ||
      !(parsed as { hubs?: unknown }).hubs ||
      typeof (parsed as { hubs?: unknown }).hubs !== 'object' ||
      Array.isArray((parsed as { hubs?: unknown }).hubs)
    ) {
      throw new Error(
        `Credential file "${this.filePath()}" has an unsupported format.`,
      );
    }
    return parsed as CredentialFile;
  }

  private async write(file: CredentialFile): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await safeChmod(this.root, 0o700);
    const temporary = path.join(
      this.root,
      `.credentials-${process.pid}-${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await safeChmod(temporary, 0o600);
      await rename(temporary, this.filePath());
      await safeChmod(this.filePath(), 0o600);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

async function safeChmod(target: string, mode: number): Promise<void> {
  try {
    await chmod(target, mode);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}
