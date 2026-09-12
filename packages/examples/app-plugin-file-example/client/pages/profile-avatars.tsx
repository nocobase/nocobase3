import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';

import { FilePreviewDialog } from '../components/file-preview-dialog.js';
import { FileThumbnail } from '../components/file-thumbnail.js';
import { FileUploadField } from '../components/file-upload-field.js';
import {
  profilesRepository,
  resources,
  type BusinessFileRecord,
  type ProfileRecord,
} from '../lib/business.js';
import { useFileLabels } from '../lib/labels.js';

interface ProfileRow {
  readonly profile: ProfileRecord;
  readonly avatar?: BusinessFileRecord;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** One-to-one demo: every profile has at most one avatar file. */
export default function ProfileAvatarsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file-example');
  const labels = useFileLabels();
  const api = useService(apiClientToken);
  const manager = useService(clientFileRepositoryManagerToken);
  const profiles = useMemo(() => profilesRepository(api), [api]);
  const avatars = useMemo(
    () => manager.repository(resources.profileAvatars),
    [manager],
  );
  const [rows, setRows] = useState<readonly ProfileRow[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    readonly files: readonly BusinessFileRecord[];
    readonly index: number;
  }>({ files: [], index: -1 });

  const fetchRows = useCallback(async (): Promise<readonly ProfileRow[]> => {
    const [profileRows, fileRows] = await Promise.all([
      profiles.findMany({ limit: 50 }),
      avatars.findMany({ limit: 100 }),
    ]);
    const businessFiles: readonly BusinessFileRecord[] = fileRows;
    const byProfile = new Map<string, BusinessFileRecord>();
    for (const file of businessFiles)
      if (file.profileId) byProfile.set(file.profileId, file);
    return profileRows
      .map((profile) => ({
        profile,
        avatar: byProfile.get(profile.id),
      }))
      .sort((left, right) =>
        left.profile.name.localeCompare(right.profile.name),
      );
  }, [profiles, avatars]);

  useEffect(() => {
    let active = true;
    void fetchRows().then(
      (loaded) => {
        if (active) setRows(loaded);
      },
      (cause: unknown) => {
        if (active) setError(messageOf(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [fetchRows]);

  const mutate = useCallback(
    async (
      profileId: string,
      values: Parameters<typeof profiles.updateOne>[0]['values'],
    ): Promise<void> => {
      setBusyId(profileId);
      setError('');
      try {
        await profiles.updateOne({
          filter: { id: profileId },
          values,
        });
        setRows(await fetchRows());
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusyId(undefined);
      }
    },
    [profiles, fetchRows],
  );

  return (
    <main className='mx-auto max-w-5xl space-y-6 p-8'>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{t('profilesTitle')}</h1>
        <p className='text-sm text-muted-foreground'>
          {t('profilesDescription')}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t('profilesRelationHint')}
        </p>
      </header>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <ul className='divide-y rounded-lg border'>
        {rows.map(({ profile, avatar }) => (
          <li
            key={profile.id}
            className='flex flex-wrap items-center gap-4 p-4'
          >
            <button
              type='button'
              disabled={!avatar}
              aria-label={
                avatar ? `${labels.preview}: ${avatar.filename}` : t('noAvatar')
              }
              className='size-14 shrink-0 overflow-hidden rounded-full border disabled:cursor-default'
              onClick={() => setPreview({ files: [avatar!], index: 0 })}
            >
              {avatar ? (
                <FileThumbnail file={avatar} />
              ) : (
                <span className='flex h-full items-center justify-center text-[10px] text-muted-foreground'>
                  {t('noAvatar')}
                </span>
              )}
            </button>
            <div className='min-w-0 flex-1'>
              <p className='font-medium'>{profile.name}</p>
              <p className='text-sm text-muted-foreground'>
                {profile.jobTitle}
              </p>
              <p className='text-xs text-muted-foreground'>
                {avatar ? avatar.filename : t('profilesNoFile')}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <FileUploadField
                compact
                repository={avatars}
                accept={['image/*']}
                maxSize={5 * 1024 * 1024}
                disabled={busyId === profile.id}
                labels={{
                  ...labels,
                  choose: avatar ? t('replaceAvatar') : t('uploadAvatar'),
                }}
                onChange={(records) =>
                  mutate(profile.id, {
                    avatar: { connect: { id: records[0].id } },
                  })
                }
              />
              {avatar ? (
                <button
                  type='button'
                  className='rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50'
                  disabled={busyId === profile.id}
                  onClick={() =>
                    void mutate(profile.id, { avatar: { disconnect: true } })
                  }
                >
                  {t('removeAvatar')}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('profilesEmpty')}
        </p>
      )}
      <p className='text-sm text-muted-foreground'>{t('avatarHint')}</p>
      <FilePreviewDialog
        files={preview.files}
        index={preview.index}
        labels={labels}
        onIndexChange={(index) =>
          setPreview((current) => ({ ...current, index }))
        }
        onClose={() => setPreview({ files: [], index: -1 })}
      />
    </main>
  );
}
