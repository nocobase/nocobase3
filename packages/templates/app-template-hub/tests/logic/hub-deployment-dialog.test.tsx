import { useState, type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeploymentDialog } from '../../../../plugins/app-plugin-hub/client/pages/hub/configuration.js';
import type {
  AppDetail,
  ConfigMode,
} from '../../../../plugins/app-plugin-hub/client/pages/hub/types.js';

vi.mock(
  '../../../../plugins/app-plugin-hub/client/components/config-editor.js',
  () => ({
    ConfigMergeEditor: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (value: string) => void;
    }) => (
      <textarea
        aria-label='New configuration'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    ConfigUnifiedDiff: () => <div>Configuration review</div>,
    ConfigEditor: () => null,
  }),
);

const app = {
  app: { id: 'a', name: 'Example', currentDeploymentId: null },
  releases: ['one', 'two'].map((id) => ({
    id,
    version: id,
    checksum: id,
    hasConfigTemplate: true,
    createdAt: '2026-09-01T00:00:00Z',
    size: 1,
  })),
} as AppDetail;

function Dialog({
  loadTemplate,
}: {
  loadTemplate: (appId: string, releaseId: string) => Promise<string | null>;
}): ReactElement {
  const [releaseId, setReleaseId] = useState('one');
  const [content, setContent] = useState('stale: true');
  const [mode, setMode] = useState<ConfigMode>('file');
  return (
    <DeploymentDialog
      app={app}
      releaseId={releaseId}
      content={content}
      mode={mode}
      baselineContent='current: true'
      baselineMode='file'
      rollback={false}
      busy={false}
      onRelease={setReleaseId}
      loadTemplate={loadTemplate}
      onContent={setContent}
      onMode={setMode}
      onClose={() => undefined}
      onComplete={() => undefined}
    />
  );
}

describe('Hub deployment configuration step', () => {
  it('loads only after Continue, blocks on failure, and allows retry', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue('fresh: true');
    render(<Dialog loadTemplate={loader} />);
    fireEvent.click(screen.getByRole('button', { name: /vtwo/ }));
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(
      await screen.findByText(/Failed to load configuration template/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
    expect(
      screen.queryByRole('textbox', { name: 'New configuration' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('textbox', { name: 'New configuration' }),
    ).toHaveValue('fresh: true');
    expect(loader).toHaveBeenLastCalledWith('a', 'two');
    expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled();
  });

  it('preserves edits when going back without changing release', async () => {
    const loader = vi.fn().mockResolvedValue('fresh: true');
    render(<Dialog loadTemplate={loader} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const editor = await screen.findByRole('textbox', {
      name: 'New configuration',
    });
    fireEvent.change(editor, { target: { value: 'edited: true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'New configuration' }),
      ).toHaveValue('edited: true'),
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
