import { apiClientToken, useService } from '@nocobase/app-client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
} from '../../registry/nocobase-ai/shared/ui/alert.js';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import { Input } from '../../registry/nocobase-ai/shared/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../registry/nocobase-ai/shared/ui/table.js';
import { SkillDetailsDrawer } from '../components/skill-details-drawer.js';
import { useT } from '../locales/index.js';
import { SettingsShell } from '../settings-shell.js';
import {
  listManagedSkills,
  type ManagedSkillSummary,
} from '../skills-management-service.js';

type SkillsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; skills: ManagedSkillSummary[] };

export default function SkillsSettingsPage(): ReactElement {
  const api = useService(apiClientToken);
  const t = useT();
  const [state, setState] = useState<SkillsState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ManagedSkillSummary | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listManagedSkills(api, controller.signal).then(
      (skills) => {
        if (!controller.signal.aborted) setState({ status: 'ready', skills });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [api, attempt]);

  const keyword = query.trim().toLocaleLowerCase();
  const skills =
    state.status === 'ready'
      ? state.skills.filter((skill) =>
          [
            skill.name,
            skill.title,
            skill.description,
            ...skill.tools.flatMap((tool) => [tool.name, tool.title]),
          ].some((value) => value.toLocaleLowerCase().includes(keyword)),
        )
      : [];

  function openSkill(
    skill: ManagedSkillSummary,
    button: HTMLButtonElement | null,
  ): void {
    returnFocusRef.current = button;
    setSelected(skill);
  }

  return (
    <SettingsShell
      title='Skills'
      description='Browse skills available to AI employees.'
    >
      <section aria-label={t('Skills')} className='flex min-w-0 flex-col gap-4'>
        <Input
          type='search'
          aria-label={t('Search skills')}
          placeholder={t('Search skills')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className='max-w-md'
        />
        {state.status === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('Loading skills…')}
          </p>
        ) : state.status === 'error' ? (
          <Alert variant='destructive'>
            <AlertDescription className='flex flex-col items-start gap-3'>
              <p>{t('Unable to load skills.')}</p>
              <Button
                variant='outline'
                onClick={() => {
                  setState({ status: 'loading' });
                  setAttempt((value) => value + 1);
                }}
              >
                {t('Retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !skills.length ? (
          <p
            role='status'
            className='rounded-lg border border-dashed p-5 text-sm text-muted-foreground'
          >
            {t(
              state.skills.length
                ? 'No skills match your search.'
                : 'No skills are available.',
            )}
          </p>
        ) : (
          <div className='min-w-0 rounded-lg border bg-card text-card-foreground'>
            <Table aria-label={t('Skills')} className='table-fixed'>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>{t('skills.skill')}</TableHead>
                  <TableHead scope='col'>{t('skills.description')}</TableHead>
                  <TableHead scope='col'>{t('skills.tools')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow
                    key={skill.name}
                    className='cursor-pointer'
                    onClick={(event) =>
                      openSkill(
                        skill,
                        event.currentTarget.querySelector('button'),
                      )
                    }
                  >
                    <TableCell className='whitespace-normal align-top'>
                      <Button
                        variant='link'
                        aria-haspopup='dialog'
                        className='h-auto max-w-full justify-start whitespace-normal break-words px-0 text-left'
                        onClick={(event) => {
                          event.stopPropagation();
                          openSkill(skill, event.currentTarget);
                        }}
                      >
                        {skill.title.trim() || skill.name}
                      </Button>
                      <p className='break-all font-mono text-xs text-muted-foreground'>
                        {skill.name}
                      </p>
                    </TableCell>
                    <TableCell className='whitespace-pre-wrap break-words align-top'>
                      {skill.description}
                    </TableCell>
                    <TableCell className='whitespace-normal align-top'>
                      {skill.tools.length ? (
                        <ul className='flex flex-col gap-1'>
                          {skill.tools.map((tool) => (
                            <li
                              key={tool.name}
                              className='break-all font-mono text-xs'
                            >
                              {tool.name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className='text-muted-foreground'>
                          {t('skills.noTools')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <SkillDetailsDrawer
        selected={selected}
        onClose={() => setSelected(null)}
        returnFocusRef={returnFocusRef}
      />
    </SettingsShell>
  );
}
