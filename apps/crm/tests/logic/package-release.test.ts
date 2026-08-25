// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createReleaseArtifact,
  createVerifiedReleaseArtifact,
} from '../../scripts/package-release.mjs';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CRM release packaging', () => {
  it('creates one immutable release and converges on a repeated run', () => {
    const { appRoot, outputRoot } = createFixture();
    const input = {
      appRoot,
      outputRoot,
      releaseId: 'release-v1',
      nocoBaseApiUrl: 'http://127.0.0.1:13000/api',
      createdAt: '2026-08-18T00:00:00.000Z',
    };

    const created = createReleaseArtifact(input);
    const repeated = createReleaseArtifact(input);

    expect(created.status).toBe('created');
    expect(repeated).toMatchObject({
      status: 'unchanged',
      appId: 'crm',
      releaseId: 'release-v1',
      artifactSha256: created.artifactSha256,
    });
    expect(fs.readdirSync(path.join(outputRoot, 'crm', 'releases'))).toEqual([
      'release-v1',
    ]);
    expect(
      readJson(path.join(created.releaseRoot, 'app-release.json')),
    ).toMatchObject({
      schemaVersion: 1,
      appId: 'crm',
      releaseId: 'release-v1',
      version: '0.1.0',
      artifactSha256: created.artifactSha256,
      createdAt: '2026-08-18T00:00:00.000Z',
      runtime: { healthPath: '/healthz' },
    });
    expect(
      readJson(path.join(created.releaseRoot, 'package.json')),
    ).toMatchObject({
      app: { config: { nocoBaseApiUrl: 'http://127.0.0.1:13000/api' } },
    });
    expect(
      readJson(path.join(created.releaseRoot, 'release-metadata.json')),
    ).toMatchObject({
      contractSha256: created.contractSha256,
    });
    expect(
      readJson(
        path.join(
          created.releaseRoot,
          'dist',
          'server',
          'release-contract.json',
        ),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      dataSourceKey: 'main',
      model: {
        collections: [
          { name: 'agent_crm_accounts' },
          { name: 'agent_crm_leads' },
        ],
      },
      acl: {
        roles: [{ name: 'r_agent_crm_test' }],
      },
    });
    expect(hostStyleArtifactHash(path.join(created.releaseRoot, 'dist'))).toBe(
      created.artifactSha256,
    );
  });

  it('rejects changed contents for an existing release id', () => {
    const { appRoot, outputRoot } = createFixture();
    const input = {
      appRoot,
      outputRoot,
      releaseId: 'release-v1',
      nocoBaseApiUrl: 'http://127.0.0.1:13000/api',
    };
    createReleaseArtifact(input);
    fs.writeFileSync(
      path.join(appRoot, 'dist', 'server', 'embedded.js'),
      "export default 'changed';\n",
    );

    expect(() => createReleaseArtifact(input)).toThrow(
      /immutable; choose a new release id/,
    );
  });

  it('rejects unsafe release ids before writing', () => {
    const { appRoot, outputRoot } = createFixture();

    expect(() =>
      createReleaseArtifact({
        appRoot,
        outputRoot,
        releaseId: '../release-v1',
        nocoBaseApiUrl: 'http://127.0.0.1:13000/api',
      }),
    ).toThrow(/safe path segment/);
    expect(fs.existsSync(outputRoot)).toBe(false);
  });

  it('requires an explicit environment before the verified packaging path writes', () => {
    const { appRoot, outputRoot } = createFixture();

    expect(() =>
      createVerifiedReleaseArtifact({
        appRoot,
        outputRoot,
        releaseId: 'release-v1',
        nocoBaseApiUrl: 'http://127.0.0.1:13000/api',
      }),
    ).toThrow('Target env is required for the release contract gate');
    expect(fs.existsSync(outputRoot)).toBe(false);
  });

  it('packages a native release without an external NocoBase environment', () => {
    const { appRoot, outputRoot } = createFixture();
    const configPath = path.join(appRoot, 'app-release.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ...(readJson(configPath) as Record<string, unknown>),
        dataRuntime: 'native',
      }),
    );

    const result = createVerifiedReleaseArtifact({
      appRoot,
      outputRoot,
      releaseId: 'release-native-v1',
      createdAt: '2026-08-22T00:00:00.000Z',
    });

    expect(result.status).toBe('created');
    expect(result.verification).toMatchObject({
      mode: 'native',
      database: 'release-owned',
    });
    expect(
      readJson(path.join(result.releaseRoot, 'package.json')),
    ).toMatchObject({
      app: { config: { dataRuntime: 'native' } },
    });
    expect(
      readJson(path.join(result.releaseRoot, 'release-metadata.json')),
    ).toMatchObject({
      dataRuntime: 'native',
    });
  });
});

function createFixture(): { appRoot: string; outputRoot: string } {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-crm-release-'),
  );
  tempDirectories.push(directory);
  const appRoot = path.join(directory, 'app');
  const outputRoot = path.join(directory, 'app-dist');
  fs.mkdirSync(path.join(appRoot, 'dist', 'server'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'dist', 'client'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'nocobase', 'model', 'collections'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(appRoot, 'nocobase', 'model', 'relations'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(appRoot, 'nocobase', 'acl'), { recursive: true });
  fs.writeFileSync(
    path.join(appRoot, 'package.json'),
    JSON.stringify({ name: '@nocobase/app-crm', version: '0.1.0' }),
  );
  fs.writeFileSync(
    path.join(appRoot, 'app-release.config.json'),
    JSON.stringify({
      appId: 'crm',
      dataSourceKey: 'main',
      aclPolicy: 'nocobase/acl/policy.json',
      healthPath: '/healthz',
      runtime: { backend: 'in-process', isolation: 'in-process', tier: 'warm' },
      requiredCollections: ['agent_crm_accounts', 'agent_crm_leads'],
    }),
  );
  fs.writeFileSync(
    path.join(appRoot, 'nocobase', 'model', 'collections', '10-accounts.json'),
    JSON.stringify({
      name: 'agent_crm_accounts',
      template: 'general',
      fields: [],
    }),
  );
  fs.writeFileSync(
    path.join(appRoot, 'nocobase', 'model', 'collections', '20-leads.json'),
    JSON.stringify({
      name: 'agent_crm_leads',
      template: 'general',
      fields: [],
    }),
  );
  fs.writeFileSync(
    path.join(appRoot, 'nocobase', 'acl', 'policy.json'),
    JSON.stringify({
      schemaVersion: 1,
      dataSourceKey: 'main',
      roles: [
        {
          name: 'r_agent_crm_test',
          title: 'CRM Test',
          description: 'CRM test role',
          allowConfigure: false,
          allowNewMenu: false,
          snippets: ['!app', '!pm', '!pm.*', '!ui.*'],
          globalActions: [],
          resources: [
            {
              name: 'agent_crm_accounts',
              actions: [{ name: 'view', scope: 'all', fieldPolicy: 'all' }],
            },
            {
              name: 'agent_crm_leads',
              actions: [{ name: 'view', scope: 'own', fieldPolicy: 'all' }],
            },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    "export default 'crm';\n",
  );
  fs.writeFileSync(
    path.join(appRoot, 'dist', 'server.js'),
    "export default 'root-file';\n",
  );
  fs.writeFileSync(
    path.join(appRoot, 'dist', 'client', 'index.html'),
    '<div id="root"></div>\n',
  );
  return { appRoot, outputRoot };
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hostStyleArtifactHash(root: string): string {
  const hash = createHash('sha256');
  const visit = (directory: string): void => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      const relative = path.relative(root, entryPath).split(path.sep).join('/');
      hash.update(relative);
      hash.update('\0');
      hash.update(fs.readFileSync(entryPath));
      hash.update('\0');
    }
  };
  visit(root);
  return hash.digest('hex');
}
