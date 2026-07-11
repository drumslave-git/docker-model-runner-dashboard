import {
  Activity,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  Monitor,
  Moon,
  Power,
  RefreshCcw,
  Search,
  Server,
  Sun,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  deleteModel,
  getCatalogTags,
  getLoadedModels,
  getModels,
  getStatus,
  pullModel,
  searchCatalog,
  unloadModel
} from './lib/api';
import type { ApiStatus, CatalogModel, CatalogTag, DmrBackend, DmrModel, LoadedModel } from './types';

const suggestedModels = ['ai/smollm2', 'ai/llama3.2', 'ai/qwen2.5-coder'];
const themeOptions = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon }
] as const;

type Theme = (typeof themeOptions)[number]['value'];
const themeStorageKey = 'dmr-theme';

function getInitialTheme(): Theme {
  try {
    const savedTheme = localStorage.getItem(themeStorageKey) ?? localStorage.getItem('theme');
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system';
  } catch {
    return 'system';
  }
}

function applyDocumentTheme(theme: Theme, systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches) {
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function valueOrDash(value?: string | number) {
  return value ? String(value) : '-';
}

function shortDigest(value?: string) {
  return value ? `${value.slice(0, 19)}...${value.slice(-12)}` : undefined;
}

function percentageFromMessage(message: string) {
  const matches = [...message.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function CatalogExplorer({
  pullingReference,
  onPull
}: {
  pullingReference?: string;
  onPull: (reference: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogModel[]>([]);
  const [selected, setSelected] = useState<CatalogModel>();
  const [fullDescription, setFullDescription] = useState('');
  const [tags, setTags] = useState<CatalogTag[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const numberFormat = useMemo(() => new Intl.NumberFormat(undefined, { notation: 'compact' }), []);

  async function selectModel(model: CatalogModel) {
    setSelected(model);
    setFullDescription(model.description);
    setTags([]);
    setCatalogError('');
    setLoadingTags(true);

    try {
      const details = await getCatalogTags(model.name);
      setTags(details.tags);
      setFullDescription(details.description ?? model.description);
    } catch (tagsError) {
      setCatalogError(tagsError instanceof Error ? tagsError.message : 'Unable to load model tags');
    } finally {
      setLoadingTags(false);
    }
  }

  async function runSearch(nextQuery = query) {
    const searchQuery = nextQuery.trim();

    if (!searchQuery) {
      return;
    }

    setQuery(searchQuery);
    setCatalogError('');
    setSearching(true);
    setSelected(undefined);
    setFullDescription('');
    setTags([]);

    try {
      const nextResults = await searchCatalog(searchQuery);
      setResults(nextResults);

      if (nextResults.length) {
        await selectModel(nextResults[0]);
      }
    } catch (searchError) {
      setResults([]);
      setCatalogError(searchError instanceof Error ? searchError.message : 'Unable to search the model catalog');
    } finally {
      setSearching(false);
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">Explore models</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Search Docker Hub, compare tags, and pull the exact variant you want</p>
          </div>
          <button
            aria-expanded={expanded}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? 'Collapse' : 'Expand'}
            <ChevronDown className={classNames('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
        {expanded ? (
          <form className="mt-4 flex w-full gap-2 lg:max-w-xl" onSubmit={handleSearch}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                aria-label="Search model catalog"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-cyan-950"
                disabled={searching}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search gemma4, qwen, llama..."
                value={query}
              />
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={searching || !query.trim()}
              type="submit"
            >
              <Search className={classNames('h-4 w-4', searching && 'animate-pulse')} />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
        ) : null}
        {expanded && !results.length && !searching ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Try:</span>
            {['gemma4', 'qwen', 'llama'].map((suggestion) => (
              <button
                className="rounded-full border border-slate-200 px-2.5 py-1 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:hover:border-cyan-800 dark:hover:bg-cyan-950 dark:hover:text-cyan-300"
                key={suggestion}
                onClick={() => void runSearch(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {expanded && catalogError ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {catalogError}
        </div>
      ) : null}

      {expanded && results.length ? (
        <div className="grid min-h-[360px] lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <div className="border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {results.length} result{results.length === 1 ? '' : 's'}
            </div>
            <div className="max-h-[520px] overflow-y-auto p-2">
              {results.map((model) => {
                const active = selected?.name === model.name;
                return (
                  <button
                    className={classNames(
                      'flex w-full items-center gap-3 rounded-md p-3 text-left transition',
                      active
                        ? 'bg-cyan-50 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    )}
                    key={model.name}
                    onClick={() => void selectModel(model)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{model.name}</span>
                        {model.official ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-300">Official</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{model.description}</p>
                      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        {numberFormat.format(model.downloads)} pulls · {model.backend ?? 'Backend not listed'}
                      </p>
                    </div>
                    <ChevronRight className={classNames('h-4 w-4 shrink-0', active ? 'text-cyan-600' : 'text-slate-300 dark:text-slate-600')} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            {selected ? (
              <>
                <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{selected.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {loadingTags ? 'Loading available tags...' : `${tags.length} available tag${tags.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Updated {formatDate(selected.updatedAt)}</p>
                </div>
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {fullDescription || 'No description available.'}
                  </p>
                </div>
                {loadingTags ? (
                  <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                    Loading tags from Docker Hub
                  </div>
                ) : tags.length ? (
                  <div className="max-h-[520px] overflow-y-auto">
                    <table className="w-full min-w-[560px]">
                      <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Tag</th>
                          <th className="px-4 py-3 font-semibold">Size</th>
                          <th className="px-4 py-3 font-semibold">Updated</th>
                          <th className="px-4 py-3 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tags.map((tag) => {
                          const reference = `${selected.name}:${tag.name}`;
                          const pulling = pullingReference === reference;
                          return (
                            <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800" key={tag.name}>
                              <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{tag.name}</td>
                              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{formatBytes(tag.size)}</td>
                              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{formatDate(tag.updatedAt)}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 dark:hover:bg-cyan-900"
                                  disabled={Boolean(pullingReference)}
                                  onClick={() => {
                                    setExpanded(false);
                                    onPull(reference);
                                  }}
                                  type="button"
                                >
                                  <Download className="h-4 w-4" />
                                  {pulling ? 'Pulling...' : 'Pull'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400">No tags were returned for this model.</div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : expanded && !searching ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <Search className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">Find a model to get started</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Search by model name or description, then choose a tag to pull.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div
      aria-label="Color theme"
      className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      role="radiogroup"
    >
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            aria-checked={active}
            aria-label={`Use ${option.label.toLowerCase()} theme`}
            className={classNames(
              'inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium transition sm:px-2.5',
              active
                ? 'bg-slate-100 text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {ok ? 'Connected' : 'Offline'}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <div className="shrink-0 rounded-md bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">{icon}</div>
      </div>
    </section>
  );
}

function BooleanPill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        active
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      )}
    >
      <span className={classNames('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500')} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function BackendRow({ backend }: { backend: DmrBackend }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-950 dark:text-slate-50">{backend.name}</p>
      </td>
      <td className="px-4 py-3">
        <BooleanPill active={backend.installed} activeLabel="Installed" inactiveLabel="Not installed" />
      </td>
      <td className="px-4 py-3">
        <BooleanPill active={backend.running} activeLabel="Running" inactiveLabel="Stopped" />
      </td>
    </tr>
  );
}

function LoadedModelRow({
  model,
  busy,
  onUnload
}: {
  model: LoadedModel;
  busy: boolean;
  onUnload: () => void;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-3">
        <p className="truncate font-medium text-slate-950 dark:text-slate-50" title={model.displayName}>
          {model.displayName}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{model.mode ?? 'Mode not reported'}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{valueOrDash(model.backend)}</td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{valueOrDash(model.until)}</td>
      <td className="px-4 py-3 text-right">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300"
          disabled={busy}
          onClick={onUnload}
          title={`Unload ${model.displayName}`}
          type="button"
        >
          <Power className="h-4 w-4" />
          {busy ? 'Unloading...' : 'Unload'}
        </button>
      </td>
    </tr>
  );
}

function ModelRow({
  model,
  busy,
  onDelete
}: {
  model: DmrModel;
  busy: boolean;
  onDelete: () => void;
}) {
  const canDelete = model.id.includes('/');
  const digestOnly = model.id.startsWith('sha256:');

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-slate-950 dark:text-slate-50" title={model.displayName}>
            {model.displayName}
          </span>
          <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={model.digest}>
            {digestOnly ? 'DMR CLI did not return a model reference' : shortDigest(model.digest)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{valueOrDash(model.parameters)}</td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{valueOrDash(model.quantization)}</td>
      <td className="hidden px-4 py-3 text-sm text-slate-600 dark:text-slate-300 md:table-cell">{valueOrDash(model.architecture)}</td>
      <td className="hidden px-4 py-3 text-sm text-slate-600 dark:text-slate-300 lg:table-cell">{valueOrDash(model.modified)}</td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{valueOrDash(model.size)}</td>
      <td className="px-4 py-3 text-right">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300"
          disabled={busy || !canDelete}
          onClick={onDelete}
          title={canDelete ? `Delete ${model.displayName}` : 'Cannot delete: DMR only returned a digest'}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [status, setStatus] = useState<ApiStatus | undefined>();
  const [models, setModels] = useState<DmrModel[]>([]);
  const [loadedModels, setLoadedModels] = useState<LoadedModel[]>([]);
  const [modelInput, setModelInput] = useState(suggestedModels[0]);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [pullMessages, setPullMessages] = useState<string[]>([]);
  const [pullPercent, setPullPercent] = useState<number | undefined>();
  const [pullState, setPullState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [pullTarget, setPullTarget] = useState('');

  const modelRefs = useMemo(() => models.filter((model) => !model.id.startsWith('sha256:')).length, [models]);
  const installedBackends = status?.backends.filter((backend) => backend.installed).length ?? 0;
  const runningBackends = status?.backends.filter((backend) => backend.running).length ?? 0;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => applyDocumentTheme(theme, mediaQuery.matches);

    try {
      localStorage.setItem(themeStorageKey, theme);
      localStorage.removeItem('theme');
    } catch {
      // The theme still works for this session when storage is unavailable.
    }
    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  function handleThemeChange(nextTheme: Theme) {
    applyDocumentTheme(nextTheme);
    setTheme(nextTheme);
  }

  async function refresh() {
    setError('');
    setLoading(true);

    try {
      const [nextStatus, nextModels, nextLoadedModels] = await Promise.all([
        getStatus(),
        getModels(),
        getLoadedModels()
      ]);
      setStatus(nextStatus);
      setModels(nextModels);
      setLoadedModels(nextLoadedModels);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startPull(requestedModel: string) {
    setError('');
    setBusyAction('pull');
    setPullTarget(requestedModel);
    setPullMessages([]);
    setPullPercent(undefined);
    setPullState('running');

    const appendMessage = (message: string) => {
      setPullMessages((current) => {
        if (current.at(-1) === message) {
          return current;
        }

        return [...current, message].slice(-16);
      });
    };

    try {
      await pullModel(requestedModel, (progressEvent) => {
        appendMessage(progressEvent.message);
        const percent = percentageFromMessage(progressEvent.message);

        if (percent !== undefined) {
          setPullPercent((current) => Math.max(current ?? 0, percent));
        }

        if (progressEvent.type === 'complete') {
          setPullPercent(100);
          setPullState('success');
        } else if (progressEvent.type === 'error') {
          setPullState('error');
        }
      });
      await refresh();
    } catch (pullError) {
      const message = pullError instanceof Error ? pullError.message : 'Unable to pull model';
      appendMessage(message);
      setPullState('error');
      setError(message);
    } finally {
      setBusyAction('');
    }
  }

  function handlePull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void startPull(modelInput.trim());
  }

  async function handleDelete(model: string) {
    setError('');
    setBusyAction(`delete:${model}`);

    try {
      await deleteModel(model);
      setModels((current) => current.filter((item) => item.id !== model));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete model');
    } finally {
      setBusyAction('');
    }
  }

  async function handleUnload(model: LoadedModel) {
    const action = `unload:${model.id}:${model.backend ?? ''}`;
    setError('');
    setBusyAction(action);

    try {
      await unloadModel(model.id, model.backend);
      setLoadedModels((current) =>
        current.filter((item) => item.id !== model.id || item.backend !== model.backend)
      );
    } catch (unloadError) {
      setError(unloadError instanceof Error ? unloadError.message : 'Unable to unload model');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-panel">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950 dark:text-slate-50">DMR Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{status?.cli ?? 'docker model'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle onChange={handleThemeChange} theme={theme} />
            <StatusPill ok={Boolean(status?.ok)} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950"
              disabled={loading}
              onClick={() => void refresh()}
              type="button"
            >
              <RefreshCcw className={classNames('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            detail={status?.ok ? `${status.latencyMs} ms CLI response` : 'Start Docker Desktop and enable Model Runner'}
            icon={<Activity className="h-5 w-5" />}
            label="Runner"
            value={status?.ok ? 'Ready' : 'Unavailable'}
          />
          <MetricCard
            detail={`${modelRefs} named, ${models.length - modelRefs} digest-only`}
            icon={<Cpu className="h-5 w-5" />}
            label="Local Models"
            value={String(models.length)}
          />
          <MetricCard
            detail={`${installedBackends} installed`}
            icon={<Box className="h-5 w-5" />}
            label="Backends"
            value={`${runningBackends} running`}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">Backends</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Installed and running inference engines</p>
            </div>
            {status?.backends.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <tr>
                      <th className="w-[52%] px-4 py-3 font-semibold">Backend</th>
                      <th className="px-4 py-3 font-semibold">Installed</th>
                      <th className="px-4 py-3 font-semibold">Running</th>
                    </tr>
                  </thead>
                  <tbody>{status.backends.map((backend) => <BackendRow backend={backend} key={backend.name} />)}</tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Box className="h-9 w-9 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No backend status reported.</p>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">Loaded models</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Models currently held in runner memory</p>
            </div>
            {loadedModels.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <tr>
                      <th className="w-[34%] px-4 py-3 font-semibold">Model</th>
                      <th className="px-4 py-3 font-semibold">Backend</th>
                      <th className="px-4 py-3 font-semibold">Unload in</th>
                      <th className="w-32 px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadedModels.map((model) => {
                      const action = `unload:${model.id}:${model.backend ?? ''}`;
                      return (
                        <LoadedModelRow
                          busy={busyAction === action}
                          key={`${model.id}:${model.backend ?? ''}`}
                          model={model}
                          onUnload={() => void handleUnload(model)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Power className="h-9 w-9 text-slate-300 dark:text-slate-600" />
                <p className="font-medium text-slate-900 dark:text-slate-100">No models loaded</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Models appear here while they are active in memory.</p>
              </div>
            )}
          </div>
        </section>

        <CatalogExplorer
          onPull={(reference) => {
            setModelInput(reference);
            void startPull(reference);
          }}
          pullingReference={busyAction === 'pull' ? pullTarget : undefined}
        />

        <section className="rounded-lg border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">Models</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Local DMR model inventory</p>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handlePull}>
              <div>
                <input
                  className="h-10 w-full min-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-cyan-950"
                  list="suggested-models"
                  disabled={busyAction === 'pull'}
                  onChange={(event) => setModelInput(event.target.value)}
                  placeholder="ai/smollm2"
                  value={modelInput}
                />
                <datalist id="suggested-models">
                  {suggestedModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busyAction === 'pull' || !modelInput.trim()}
                type="submit"
              >
                <Download className="h-4 w-4" />
                {busyAction === 'pull' ? 'Pulling...' : 'Pull'}
              </button>
            </form>
          </div>

          {pullState !== 'idle' ? (
            <div className="border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pull activity</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {pullState === 'running'
                      ? `Downloading ${pullTarget} with Docker Model Runner`
                      : pullState === 'success'
                        ? 'Download complete; model inventory refreshed'
                        : 'Docker Model Runner could not complete the pull'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={classNames(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      pullState === 'running' && 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
                      pullState === 'success' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                      pullState === 'error' && 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    )}
                  >
                    {pullState === 'running'
                      ? pullPercent !== undefined
                        ? `${Math.round(pullPercent)}%`
                        : 'Working'
                      : null}
                    {pullState === 'success' ? 'Complete' : null}
                    {pullState === 'error' ? 'Failed' : null}
                  </span>
                  {pullState !== 'running' ? (
                    <button
                      aria-label="Dismiss pull activity"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      onClick={() => {
                        setPullState('idle');
                        setPullMessages([]);
                        setPullPercent(undefined);
                      }}
                      title="Dismiss pull activity"
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={classNames(
                    'h-full rounded-full transition-all duration-300',
                    pullState === 'error' ? 'bg-rose-500' : 'bg-cyan-600',
                    pullState === 'running' && pullPercent === undefined && 'animate-pulse'
                  )}
                  style={{ width: `${pullPercent ?? (pullState === 'error' ? 100 : 35)}%` }}
                />
              </div>

              <div className="mt-3 max-h-44 overflow-y-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 dark:border dark:border-slate-800">
                {pullMessages.map((message, index) => (
                  <div key={`${index}:${message}`}>{message}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="w-[34%] px-4 py-3 font-semibold">Model</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">Parameters</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">Quantization</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Architecture</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Created</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Size</th>
                  <th className="w-20 px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <ModelRow
                    busy={busyAction === `delete:${model.id}`}
                    key={model.id}
                    model={model}
                    onDelete={() => void handleDelete(model.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {!models.length ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <Cpu className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">No local models found</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Pull a model to populate this table.</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
