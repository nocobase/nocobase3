import {
  appApiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

interface SchemaNode {
  readonly type?: string | readonly string[];
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly enum?: readonly unknown[];
  readonly items?: SchemaNode;
}

interface ConfigSchemaDocument {
  readonly formatVersion: 1;
  readonly configs: readonly {
    readonly namespace: string;
    readonly schema: SchemaNode;
  }[];
}

interface ReleaseRecord {
  readonly id: string;
  readonly version: string;
  readonly configSchema: ConfigSchemaDocument;
}

interface AppDetail {
  readonly app: { readonly id: string; readonly name: string };
  readonly deployment: {
    readonly desiredReleaseId: string | null;
    readonly observedReleaseId: string | null;
    readonly desiredState: string;
    readonly observedState: string;
    readonly error: string | null;
  };
  readonly releases: readonly ReleaseRecord[];
  readonly hostUrl: string | null;
}

interface ApiResponse<T> {
  readonly data: T;
}

interface ConfigResponse {
  readonly content: Record<string, unknown>;
  readonly releaseId: string | null;
  readonly path: string;
}

export default function HubPage(): ReactElement {
  const client = useService(appApiClientToken);
  const [apps, setApps] = useState<readonly AppDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [newAppId, setNewAppId] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [artifact, setArtifact] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const selected = apps.find((entry) => entry.app.id === selectedId);
  const activeReleaseId =
    selectedReleaseId ??
    selected?.deployment.desiredReleaseId ??
    selected?.deployment.observedReleaseId ??
    selected?.releases[0]?.id;
  const selectedRelease = selected?.releases.find(
    (entry) => entry.id === activeReleaseId,
  );

  const loadApps = useCallback(async (): Promise<void> => {
    const response =
      await client.request<ApiResponse<readonly AppDetail[]>>('hub/apps');
    setApps(response.data);
    setSelectedId((current) => current ?? response.data[0]?.app.id);
  }, [client]);

  useEffect(() => {
    // Initial loading is an intentional external synchronization boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadApps().catch((reason: unknown) => setError(readError(reason)));
  }, [loadApps]);

  useEffect(() => {
    if (!selected) return;
    void client
      .request<ApiResponse<ConfigResponse>>(
        `hub/apps/${selected.app.id}/config`,
      )
      .then((response) => setConfig(response.data.content))
      .catch((reason: unknown) => setError(readError(reason)));
  }, [client, selected]);

  const perform = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await loadApps();
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className='mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[18rem_1fr]'>
      <aside className='space-y-5 rounded-xl border p-4'>
        <header>
          <h1 className='text-xl font-semibold'>App Hub</h1>
          <p className='text-sm text-muted-foreground'>
            Local managed applications
          </p>
        </header>
        <form
          className='space-y-2 border-b pb-4'
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              await client.request('hub/apps', {
                method: 'POST',
                body: JSON.stringify({ id: newAppId, name: newAppName }),
              });
              setSelectedId(newAppId);
              setNewAppId('');
              setNewAppName('');
            });
          }}
        >
          <input
            className='w-full rounded border px-3 py-2 text-sm'
            placeholder='App ID'
            value={newAppId}
            onChange={(event) => setNewAppId(event.target.value)}
            required
          />
          <input
            className='w-full rounded border px-3 py-2 text-sm'
            placeholder='Display name'
            value={newAppName}
            onChange={(event) => setNewAppName(event.target.value)}
            required
          />
          <button
            className='w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground'
            disabled={busy}
          >
            Create app
          </button>
        </form>
        <nav className='space-y-1'>
          {apps.map((entry) => (
            <button
              key={entry.app.id}
              type='button'
              className={`w-full rounded px-3 py-2 text-left text-sm ${selectedId === entry.app.id ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
              onClick={() => {
                setSelectedId(entry.app.id);
                setSelectedReleaseId(undefined);
              }}
            >
              <span className='block'>{entry.app.name}</span>
              <span className='text-xs text-muted-foreground'>
                {entry.deployment.observedState}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className='space-y-6'>
        {error ? (
          <div className='rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'>
            {error}
          </div>
        ) : null}
        {!selected ? (
          <div className='rounded-xl border p-8 text-sm text-muted-foreground'>
            Create an app to start.
          </div>
        ) : (
          <>
            <header className='flex flex-wrap items-start justify-between gap-4 border-b pb-5'>
              <div>
                <h2 className='text-2xl font-semibold'>{selected.app.name}</h2>
                <p className='font-mono text-sm text-muted-foreground'>
                  {selected.app.id}
                </p>
              </div>
              <div className='text-right text-sm'>
                <p>Desired: {selected.deployment.desiredState}</p>
                <p>Observed: {selected.deployment.observedState}</p>
              </div>
            </header>

            <div className='rounded-xl border p-5'>
              <h3 className='mb-4 font-semibold'>Release</h3>
              <div className='grid gap-3 md:grid-cols-[1fr_1fr_auto]'>
                <input
                  className='rounded border px-3 py-2 text-sm'
                  placeholder='Version from package.json'
                  value={releaseVersion}
                  onChange={(event) => setReleaseVersion(event.target.value)}
                />
                <input
                  className='rounded border px-3 py-2 text-sm'
                  type='file'
                  accept='.gz,.tgz,application/gzip'
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setArtifact(event.target.files?.[0])
                  }
                />
                <button
                  className='rounded border px-4 py-2 text-sm'
                  disabled={busy || !artifact || !releaseVersion}
                  onClick={() =>
                    void perform(async () => {
                      if (!artifact) return;
                      const response = await fetch(
                        resolveAppUrl(
                          `/api/hub/apps/${selected.app.id}/releases`,
                        ),
                        {
                          method: 'POST',
                          credentials: 'include',
                          headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/gzip',
                            'x-release-version': releaseVersion,
                          },
                          body: artifact,
                        },
                      );
                      if (!response.ok) throw new Error(await response.text());
                      setArtifact(undefined);
                      setReleaseVersion('');
                    })
                  }
                >
                  Upload
                </button>
              </div>
              <select
                className='mt-4 w-full rounded border px-3 py-2 text-sm'
                value={activeReleaseId ?? ''}
                onChange={(event) => setSelectedReleaseId(event.target.value)}
              >
                <option value=''>Select a release</option>
                {selected.releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.version}
                  </option>
                ))}
              </select>
            </div>

            <div className='rounded-xl border p-5'>
              <h3 className='mb-1 font-semibold'>Configuration</h3>
              <p className='mb-5 text-sm text-muted-foreground'>
                Generated from the selected release schema.
              </p>
              {selectedRelease ? (
                <SchemaEditor
                  schema={selectedRelease.configSchema}
                  value={config}
                  onChange={setConfig}
                />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Select a release first.
                </p>
              )}
              <div className='mt-5 flex flex-wrap gap-2'>
                <button
                  className='rounded border px-4 py-2 text-sm'
                  disabled={busy || !activeReleaseId}
                  onClick={() =>
                    void perform(async () => {
                      await client.request(
                        `hub/apps/${selected.app.id}/config`,
                        {
                          method: 'PUT',
                          body: JSON.stringify({
                            releaseId: activeReleaseId,
                            content: config,
                          }),
                        },
                      );
                    })
                  }
                >
                  Save config
                </button>
                <button
                  className='rounded bg-primary px-4 py-2 text-sm text-primary-foreground'
                  disabled={busy || !activeReleaseId}
                  onClick={() =>
                    void perform(async () => {
                      await client.request(
                        `hub/apps/${selected.app.id}/deploy`,
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            releaseId: activeReleaseId,
                            config,
                          }),
                        },
                      );
                    })
                  }
                >
                  Deploy
                </button>
                <button
                  className='rounded border px-4 py-2 text-sm'
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await client.request(
                        `hub/apps/${selected.app.id}/restart`,
                        {
                          method: 'POST',
                        },
                      );
                    })
                  }
                >
                  Restart
                </button>
                <button
                  className='rounded border px-4 py-2 text-sm'
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await client.request(`hub/apps/${selected.app.id}/stop`, {
                        method: 'POST',
                      });
                    })
                  }
                >
                  Stop
                </button>
              </div>
              {selected.deployment.error ? (
                <p className='mt-4 text-sm text-destructive'>
                  {selected.deployment.error}
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function SchemaEditor(props: {
  readonly schema: ConfigSchemaDocument;
  readonly value: Record<string, unknown>;
  readonly onChange: (value: Record<string, unknown>) => void;
}): ReactElement {
  const knownNamespaces = new Set(
    props.schema.configs.map((entry) => entry.namespace),
  );
  const additional = Object.fromEntries(
    Object.entries(props.value).filter(([key]) => !knownNamespaces.has(key)),
  );

  return (
    <div className='space-y-6'>
      {props.schema.configs.map((entry) => (
        <fieldset key={entry.namespace} className='rounded-lg border p-4'>
          <legend className='px-2 font-medium'>
            {entry.schema.title ?? entry.namespace}
          </legend>
          <SchemaField
            schema={entry.schema}
            path={entry.namespace}
            value={props.value[entry.namespace]}
            onChange={(value) =>
              props.onChange({ ...props.value, [entry.namespace]: value })
            }
          />
        </fieldset>
      ))}
      <fieldset className='rounded-lg border p-4'>
        <legend className='px-2 font-medium'>Additional configuration</legend>
        <p className='mb-3 text-xs text-muted-foreground'>
          Namespaces without a published schema are preserved here.
        </p>
        <JsonEditor
          value={additional}
          onChange={(value) => {
            if (!isRecord(value)) return;
            props.onChange({
              ...Object.fromEntries(
                Object.entries(props.value).filter(([key]) =>
                  knownNamespaces.has(key),
                ),
              ),
              ...value,
            });
          }}
        />
      </fieldset>
    </div>
  );
}

function SchemaField(props: {
  readonly schema: SchemaNode;
  readonly path: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const type = schemaType(props.schema, props.value);
  if (type === 'object' && props.schema.properties) {
    const current = isRecord(props.value) ? props.value : {};
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        {Object.entries(props.schema.properties).map(([name, schema]) => (
          <label key={name} className='space-y-1 text-sm'>
            <span className='block font-medium'>
              {schema.title ?? name}
              {props.schema.required?.includes(name) ? ' *' : ''}
            </span>
            {schema.description ? (
              <span className='block text-xs text-muted-foreground'>
                {schema.description}
              </span>
            ) : null}
            <SchemaField
              schema={schema}
              path={`${props.path}.${name}`}
              value={current[name]}
              onChange={(value) =>
                props.onChange({ ...current, [name]: value })
              }
            />
          </label>
        ))}
      </div>
    );
  }
  if (type === 'boolean') {
    return (
      <input
        type='checkbox'
        checked={Boolean(props.value ?? props.schema.default)}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    );
  }
  if (props.schema.enum) {
    return (
      <select
        className='w-full rounded border px-3 py-2'
        value={scalarToString(props.value)}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value=''>Select…</option>
        {props.schema.enum.map((entry) => (
          <option key={scalarToString(entry)} value={scalarToString(entry)}>
            {scalarToString(entry)}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'string' || type === 'number' || type === 'integer') {
    return (
      <input
        className='w-full rounded border px-3 py-2'
        type={type === 'string' ? 'text' : 'number'}
        value={scalarToString(props.value ?? props.schema.default)}
        onChange={(event) =>
          props.onChange(
            type === 'string'
              ? event.target.value
              : event.target.value === ''
                ? undefined
                : Number(event.target.value),
          )
        }
      />
    );
  }
  return (
    <JsonEditor
      value={
        props.value ?? props.schema.default ?? (type === 'array' ? [] : {})
      }
      onChange={props.onChange}
    />
  );
}

function JsonEditor(props: {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const serialized = useMemo(
    () => JSON.stringify(props.value, null, 2),
    [props.value],
  );
  const [draft, setDraft] = useState(serialized);
  useEffect(() => {
    // The editor keeps invalid JSON locally but follows committed external values.
    // eslint-disable-next-line react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect
    setDraft(serialized);
  }, [serialized]);
  return (
    <textarea
      className='min-h-28 w-full rounded border p-3 font-mono text-xs'
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        try {
          props.onChange(JSON.parse(event.target.value) as unknown);
        } catch {
          // Keep invalid JSON as a local draft until it becomes valid.
        }
      }}
    />
  );
}

function schemaType(schema: SchemaNode, value: unknown): string {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) {
    const types = schema.type as readonly string[];
    return types.find((entry) => entry !== 'null') ?? 'object';
  }
  if (schema.properties) return 'object';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

function scalarToString(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
