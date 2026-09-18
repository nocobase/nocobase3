import { useApiClient } from '@nocobase/app-client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
} from '../../registry/nocobase-ai/shared/ui/alert.js';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../registry/nocobase-ai/shared/ui/card.js';
import { Input } from '../../registry/nocobase-ai/shared/ui/input.js';
import { ToolDetailsDrawer } from '../components/tool-details-drawer.js';
import { ToolMetadata } from '../components/tool-metadata.js';
import { useT } from '../locales/index.js';
import { compareResourceNames } from '../resource-name-order.js';
import { SettingsShell } from '../settings-shell.js';
import {
  listManagedTools,
  type ManagedToolSummary,
} from '../tools-management-service.js';

type ToolsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tools: ManagedToolSummary[] };

export default function ToolsSettingsPage(): ReactElement {
  const api = useApiClient();
  const t = useT();
  const [state, setState] = useState<ToolsState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ManagedToolSummary | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listManagedTools(api, controller.signal).then(
      (tools) => {
        if (!controller.signal.aborted) setState({ status: 'ready', tools });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [api, attempt]);

  const keyword = query.trim().toLocaleLowerCase();
  const tools =
    state.status === 'ready'
      ? state.tools
          .filter((tool) =>
            [tool.name, tool.title, tool.description].some((value) =>
              value.toLocaleLowerCase().includes(keyword),
            ),
          )
          .sort((left, right) =>
            compareResourceNames(
              left.title.trim() || left.name,
              right.title.trim() || right.name,
            ),
          )
      : [];

  function openTool(
    tool: ManagedToolSummary,
    button: HTMLButtonElement | null,
  ): void {
    returnFocusRef.current = button;
    setSelected(tool);
  }

  return (
    <SettingsShell title='tools.title' description='tools.description'>
      <section
        aria-label={t('tools.title')}
        className='flex min-w-0 flex-col gap-4'
      >
        <Input
          type='search'
          aria-label={t('tools.search')}
          placeholder={t('tools.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className='max-w-md'
        />
        {state.status === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('tools.loading')}
          </p>
        ) : state.status === 'error' ? (
          <Alert variant='destructive'>
            <AlertDescription className='flex flex-col items-start gap-3'>
              <p>{t('tools.error')}</p>
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
        ) : !tools.length ? (
          <p
            role='status'
            className='rounded-lg border border-dashed p-5 text-sm text-muted-foreground'
          >
            {t(state.tools.length ? 'tools.noMatches' : 'tools.empty')}
          </p>
        ) : (
          <ul
            aria-label={t('tools.title')}
            className='grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'
          >
            {tools.map((tool) => (
              <li key={tool.name} className='min-w-0'>
                <Card
                  className='h-full min-w-0 cursor-pointer hover:ring-ring focus-within:ring-2 focus-within:ring-ring'
                  onClick={(event) =>
                    openTool(tool, event.currentTarget.querySelector('button'))
                  }
                >
                  <CardHeader className='min-w-0'>
                    <CardTitle role='heading' aria-level={2}>
                      <Button
                        variant='link'
                        aria-haspopup='dialog'
                        className='h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left [overflow-wrap:anywhere]'
                        onClick={(event) => {
                          event.stopPropagation();
                          openTool(tool, event.currentTarget);
                        }}
                      >
                        {tool.title.trim() || tool.name}
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      <span
                        translate='no'
                        className='break-all font-mono text-xs'
                      >
                        {tool.name}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='min-w-0'>
                    <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>
                      {tool.description}
                    </p>
                  </CardContent>
                  {tool.scope || tool.source ? (
                    <CardFooter className='mt-auto min-w-0'>
                      <ToolMetadata tool={tool} />
                    </CardFooter>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ToolDetailsDrawer
        selected={selected}
        onClose={() => setSelected(null)}
        returnFocusRef={returnFocusRef}
      />
    </SettingsShell>
  );
}
