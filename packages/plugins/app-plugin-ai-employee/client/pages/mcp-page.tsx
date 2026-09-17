import {
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import { CircleAlert, Server, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  listMCPServers,
  listMCPTools,
  updateMCPServerEnabled,
  updateMCPToolPermission,
  type MCPRecord,
  type MCPToolEntry,
  type MCPTransport,
} from '../mcp-service.js';
import { useT } from '../locales/index.js';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../registry/nocobase-ai/shared/ui/card.js';
import { Switch } from '../../registry/nocobase-ai/shared/ui/switch.js';

const transportLabels: Record<MCPTransport, string> = {
  stdio: 'Stdio',
  http: 'mcp.transportHttp',
  sse: 'mcp.transportSse',
};

const transportColors: Record<MCPTransport, string> = {
  stdio: 'bg-blue-100 text-blue-800',
  http: 'bg-green-100 text-green-800',
  sse: 'bg-amber-100 text-amber-800',
};

export default function MCPPage(): ReactElement {
  const api = useService(apiClientToken);
  const t = useT();
  const [servers, setServers] = useState<MCPRecord[]>([]);
  const [tools, setTools] = useState<Record<string, MCPToolEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<MCPRecord>();
  const [updatingName, setUpdatingName] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextServers, nextTools] = await Promise.all([
        listMCPServers(api),
        listMCPTools(api),
      ]);
      setServers(nextServers);
      setTools(nextTools);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (server: MCPRecord): Promise<void> => {
    const enabled = !server.enabled;
    setUpdatingName(server.name);
    setServers((current) =>
      current.map((item) =>
        item.name === server.name ? { ...item, enabled } : item,
      ),
    );
    try {
      await updateMCPServerEnabled(api, server.name, enabled);
    } catch (cause) {
      setServers((current) =>
        current.map((item) =>
          item.name === server.name
            ? { ...item, enabled: server.enabled }
            : item,
        ),
      );
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUpdatingName(undefined);
    }
  };

  const openDrawer = (server: MCPRecord): void => {
    setSelected(server);
  };

  return (
    <main className='px-3 py-4 sm:px-4'>
      <Card className='gap-0 shadow-sm'>
        <CardHeader className='border-b px-4 py-4 sm:px-5'>
          <CardTitle className='text-lg'>{t('MCP servers')}</CardTitle>
          <p className='mt-1 flex items-start gap-1.5 text-sm text-muted-foreground'>
            <CircleAlert
              className='mt-0.5 h-4 w-4 shrink-0'
              aria-hidden='true'
            />
            <span>{t('mcp.configNotice')}</span>
          </p>
        </CardHeader>
        <CardContent className='p-0'>
          {error ? (
            <div
              className='mx-4 mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive sm:mx-5'
              role='alert'
            >
              {error}
            </div>
          ) : null}
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[48rem] text-left text-sm'>
              <thead className='border-b bg-muted/30 text-xs tracking-wide text-muted-foreground uppercase'>
                <tr>
                  <th className='w-12 px-5 py-3 text-center'>#</th>
                  <th className='px-5 py-3'>{t('UID')}</th>
                  <th className='px-5 py-3'>{t('Title')}</th>
                  <th className='px-5 py-3'>{t('Transport')}</th>
                  <th className='px-5 py-3'>{t('Enabled')}</th>
                  <th className='px-5 py-3'>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {loading ? (
                  <tr>
                    <td
                      className='px-3 py-10 text-center text-muted-foreground'
                      colSpan={6}
                    >
                      {t('Loading…')}
                    </td>
                  </tr>
                ) : null}
                {!loading && !servers.length ? (
                  <tr>
                    <td
                      className='px-3 py-10 text-center text-muted-foreground'
                      colSpan={6}
                    >
                      {t('No MCP servers configured.')}
                    </td>
                  </tr>
                ) : null}
                {!loading
                  ? servers.map((server, index) => (
                      <tr key={server.name} className='hover:bg-muted/30'>
                        <td className='px-5 py-4 text-center text-muted-foreground'>
                          {index + 1}
                        </td>
                        <td className='px-5 py-4 font-mono text-xs'>
                          {server.name}
                        </td>
                        <td className='px-5 py-4'>{server.title || '—'}</td>
                        <td className='px-5 py-4'>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${transportColors[server.transport]}`}
                          >
                            {t(transportLabels[server.transport])}
                          </span>
                        </td>
                        <td className='px-5 py-4'>
                          <Switch
                            checked={server.enabled}
                            disabled={updatingName === server.name}
                            onCheckedChange={() => void toggleEnabled(server)}
                            aria-label={`${t('Enabled')}: ${server.name}`}
                          />
                        </td>
                        <td className='px-5 py-4'>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            onClick={() => openDrawer(server)}
                          >
                            {t('View')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {selected ? (
        <MCPDrawer
          api={api}
          record={selected}
          tools={tools[selected.name] ?? []}
          onClose={() => {
            setSelected(undefined);
          }}
        />
      ) : null}
    </main>
  );
}

function MCPDrawer({
  api,
  record,
  tools,
  onClose,
}: {
  api: ApiClient;
  record: MCPRecord;
  tools: MCPToolEntry[];
  onClose: () => void;
}): ReactElement {
  const t = useT();
  return (
    <div
      className='fixed inset-0 z-50 bg-black/40'
      role='presentation'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className='absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l bg-background shadow-xl'
        role='dialog'
        aria-modal='true'
        aria-label={t('mcp.toolsTitle')}
      >
        <div className='flex items-center justify-between border-b px-4 py-3'>
          <div className='flex items-center gap-2 font-semibold'>
            <Server className='h-4 w-4' />
            {t('mcp.toolsTitle')}
          </div>
          <button
            type='button'
            className='rounded p-1 hover:bg-accent'
            aria-label={t('Close')}
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </button>
        </div>
        <div className='flex-1 overflow-y-auto p-4'>
          <div className='mb-5 rounded-md bg-muted/50 p-3 text-sm'>
            <div className='font-medium'>{record.title || record.name}</div>
            <div className='mt-1 font-mono text-xs text-muted-foreground'>
              {record.name} · {t(transportLabels[record.transport])}
            </div>
            {record.url ? (
              <div className='mt-1 break-all text-xs text-muted-foreground'>
                {record.url}
              </div>
            ) : null}
          </div>
          <ToolsPanel api={api} tools={tools} t={t} />
        </div>
      </aside>
    </div>
  );
}

function ToolsPanel({
  api,
  tools,
  t,
}: {
  api: ApiClient;
  tools: MCPToolEntry[];
  t: (key: string) => string;
}): ReactElement {
  const pageSize = 8;
  const [page, setPage] = useState(1);
  const [updatingTool, setUpdatingTool] = useState<string>();
  const pageCount = Math.ceil(tools.length / pageSize);
  const visibleTools = tools.slice((page - 1) * pageSize, page * pageSize);
  const updatePermission = async (
    tool: MCPToolEntry,
    permission: 'ASK' | 'ALLOW',
  ): Promise<void> => {
    setUpdatingTool(tool.name);
    try {
      await updateMCPToolPermission(api, tool.name, permission);
      tool.permission = permission;
    } finally {
      setUpdatingTool(undefined);
    }
  };
  if (!tools.length)
    return (
      <div className='rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground'>
        {t('mcp.toolsEmpty')}
      </div>
    );
  return (
    <div>
      <div className='mb-2 text-sm font-medium'>
        {t('Tools')}{' '}
        <span className='font-normal text-muted-foreground'>
          ({tools.length})
        </span>
      </div>
      <ul className='divide-y rounded-md border'>
        {visibleTools.map((tool) => (
          <li key={tool.name} className='p-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='font-medium'>{tool.title}</div>
              <div className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
                <span>{t('Permission')}</span>
                <Button
                  size='xs'
                  variant={tool.permission === 'ASK' ? 'secondary' : 'outline'}
                  disabled={updatingTool === tool.name}
                  onClick={() => void updatePermission(tool, 'ASK')}
                >
                  {t('Ask')}
                </Button>
                <Button
                  size='xs'
                  variant={
                    tool.permission === 'ALLOW' ? 'secondary' : 'outline'
                  }
                  disabled={updatingTool === tool.name}
                  onClick={() => void updatePermission(tool, 'ALLOW')}
                >
                  {t('Allow')}
                </Button>
              </div>
            </div>
            <div className='mt-1 font-mono text-xs text-muted-foreground'>
              {tool.name}
            </div>
            {tool.description ? (
              <div className='mt-2 text-sm text-muted-foreground'>
                {tool.description}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className='flex items-center justify-end gap-2 pt-4 text-sm text-muted-foreground'>
        <span>
          {t('Total')} {tools.length} {t('items')}
        </span>
        <Button
          size='sm'
          variant='ghost'
          disabled={page === 1}
          onClick={() => setPage((current) => current - 1)}
          aria-label={t('Previous page')}
        >
          ‹
        </Button>
        <span className='min-w-6 text-center text-primary'>{page}</span>
        <Button
          size='sm'
          variant='ghost'
          disabled={page === pageCount}
          onClick={() => setPage((current) => current + 1)}
          aria-label={t('Next page')}
        >
          ›
        </Button>
      </div>
    </div>
  );
}
