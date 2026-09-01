import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEPLOYMENT_FIXTURES,
  createDeploymentEvents,
  downloadCsv,
  filterDeployments,
  formatDateTime,
  getDeploymentProgress,
  type DeploymentFilters,
  type DeploymentRecord,
} from '../client/domain/operations.js';

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectUrl,
  });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('deployment operations', () => {
  it('treats date-only filters as local calendar-day boundaries', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const filters: DeploymentFilters = {
      search: '',
      applicationId: 'all',
      status: 'all',
      type: 'all',
      requestedBy: '',
      from: '2026-08-31',
      to: '2026-08-31',
      sort: 'createdAt',
    };
    const records: DeploymentRecord[] = [
      createDeploymentRecord(
        'early',
        new Date(2026, 7, 31, 0, 30).toISOString(),
      ),
      createDeploymentRecord(
        'late',
        new Date(2026, 7, 31, 23, 30).toISOString(),
      ),
    ];

    expect(filterDeployments(records, filters).map(({ id }) => id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('represents failed and cancelled deployments as terminal events without full progress', () => {
    const activationFailure = DEPLOYMENT_FIXTURES.find(
      ({ id }) => id === 'deploy-1038',
    );
    const healthFailure = DEPLOYMENT_FIXTURES.find(
      ({ id }) => id === 'deploy-1041',
    );
    const cancelled = DEPLOYMENT_FIXTURES.find(
      ({ id }) => id === 'deploy-1037',
    );

    expect(activationFailure).toBeDefined();
    expect(healthFailure).toBeDefined();
    expect(cancelled).toBeDefined();
    expect(
      createDeploymentEvents(activationFailure as DeploymentRecord).map(
        ({ stage, status }) => ({ stage, status }),
      ),
    ).toEqual([
      { stage: 'queued', status: 'succeeded' },
      { stage: 'preparing', status: 'succeeded' },
      { stage: 'failed', status: 'failed' },
    ]);
    expect(
      createDeploymentEvents(healthFailure as DeploymentRecord).at(-1),
    ).toMatchObject({ stage: 'failed', status: 'failed' });
    expect(createDeploymentEvents(cancelled as DeploymentRecord)).toMatchObject(
      [{ stage: 'cancelled', status: 'failed' }],
    );
    expect(getDeploymentProgress('failed').percent).toBeLessThan(100);
    expect(getDeploymentProgress('cancelled')).toEqual({ percent: 0, step: 0 });
  });
});

describe('formatDateTime', () => {
  it('formats dates with the active application locale', () => {
    expect(formatDateTime('2026-08-31T08:31:00.000Z', 'zh-CN')).toContain(
      '2026年8月31日',
    );
    expect(formatDateTime('2026-08-31T08:31:00.000Z', 'en-US')).toContain(
      'Aug 31, 2026',
    );
  });
});

describe('downloadCsv', () => {
  it('downloads a UTF-8 CSV and releases its object URL', async () => {
    let exportedBlob: Blob | undefined;
    const createObjectUrl = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:hub-export';
    });
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement): void {
        expect(document.body).toContainElement(this);
        expect(this).toMatchObject({
          download: 'hub-deployments.csv',
          href: 'blob:hub-export',
          hidden: true,
        });
      });

    downloadCsv('hub-deployments.csv', 'Deployment,Status\nDEP-1042,succeeded');

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(exportedBlob).toBeDefined();
    expect(exportedBlob?.type).toBe('text/csv;charset=utf-8');
    const bytes = await readBlobBytes(exportedBlob as Blob);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      'Deployment,Status\nDEP-1042,succeeded',
    );
    expect(click).toHaveBeenCalledOnce();
    expect(
      document.querySelector('a[download="hub-deployments.csv"]'),
    ).not.toBeInTheDocument();
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith('blob:hub-export');
  });

  it('cleans up the temporary anchor and object URL when the click fails', () => {
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:hub-export-failure'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked');
    });

    expect(() => downloadCsv('hub-audit.csv', 'Time,Action')).toThrow(
      'download blocked',
    );
    expect(
      document.querySelector('a[download="hub-audit.csv"]'),
    ).not.toBeInTheDocument();
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
      'blob:hub-export-failure',
    );
  });
});

function createDeploymentRecord(
  id: string,
  createdAt: string,
): DeploymentRecord {
  return {
    id,
    displayId: id.toUpperCase(),
    applicationId: 'app-test',
    applicationName: 'Test application',
    type: 'deploy',
    status: 'queued',
    environment: 'Test',
    previousRelease: null,
    targetRelease: '1.0.0',
    requestedBy: 'Test user',
    createdAt,
    startedAt: null,
    finishedAt: null,
  };
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    });
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsArrayBuffer(blob);
  });
}
