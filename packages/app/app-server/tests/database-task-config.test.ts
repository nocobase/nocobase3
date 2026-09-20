import { describe, expect, it } from 'vitest';
import { AppConfig } from '../src/config/index.js';
import { snapshotDatabaseTaskConfig } from '../src/database/task-config.js';

describe('database task configuration', () => {
  it('captures application defaults and isolates returned maps from later changes', async () => {
    const config = new AppConfig();
    await config.loadAll();
    config.mergeDefaults({ initialAdmin: { username: 'original' } });
    const snapshot = snapshotDatabaseTaskConfig(config);
    config.mergeDefaults({ initialAdmin: { username: 'changed' } });
    const value = snapshot.get<{ username: string }>('initialAdmin')!;
    value.username = 'mutated';
    expect(snapshot.get('initialAdmin.username')).toBe('original');
    expect(snapshot.get('missing')).toBeUndefined();
    expect(Object.keys(snapshot)).toEqual(['get']);
  });

  it('provides an empty reader without application configuration', () => {
    expect(snapshotDatabaseTaskConfig().get('missing')).toBeUndefined();
  });
});
