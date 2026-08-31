import { AppNotice } from '@nocobase/app-plugin-skills-example/client/components/app-notice';
import type { AppNoticeData } from '@nocobase/app-plugin-skills-example/server/tokens';
import { useEffect, useState, type ReactElement } from 'react';

import type { LoadSkillsExampleNotice } from './skills-example-notice-data';

export interface SkillsExampleNoticeProps {
  readonly loadNotice: LoadSkillsExampleNotice;
}

export function SkillsExampleNotice({
  loadNotice,
}: SkillsExampleNoticeProps): ReactElement {
  const [notice, setNotice] = useState<AppNoticeData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    void loadNotice()
      .then((result) => {
        if (active) {
          setNotice(result);
          setError(undefined);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the plugin notice.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [loadNotice]);

  if (error) {
    return <p className='text-sm text-destructive'>{error}</p>;
  }

  if (!notice) {
    return <p className='text-sm text-muted-foreground'>Loading notice…</p>;
  }

  return <AppNotice {...notice} />;
}
