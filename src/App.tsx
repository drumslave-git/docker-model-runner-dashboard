import {
  Activity,
  Box,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Download,
  Power,
  RefreshCcw,
  Server,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { deleteModel, getLoadedModels, getModels, getStatus, pullModel, unloadModel } from './lib/api';
import type { ApiStatus, DmrBackend, DmrModel, LoadedModel } from './types';

const suggestedModels = ['ai/smollm2', 'ai/llama3.2', 'ai/qwen2.5-coder'];

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

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 truncate text-sm text-slate-500">{detail}</p>
        </div>
        <div className="shrink-0 rounded-md bg-cyan-50 p-2 text-cyan-700">{icon}</div>
      </div>
    </section>
  );
}

function BooleanPill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      )}
    >
      <span className={classNames('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function BackendRow({ backend }: { backend: DmrBackend }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-950">{backend.name}</p>
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
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3">
        <p className="truncate font-medium text-slate-950" title={model.displayName}>
          {model.displayName}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{model.mode ?? 'Mode not reported'}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{valueOrDash(model.backend)}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{valueOrDash(model.until)}</td>
      <td className="px-4 py-3 text-right">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <tr className="border-b border-slate-100">
      <td className="px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-slate-950" title={model.displayName}>
            {model.displayName}
          </span>
          <span className="truncate text-xs text-slate-500" title={model.digest}>
            {digestOnly ? 'DMR CLI did not return a model reference' : shortDigest(model.digest)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{valueOrDash(model.parameters)}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{valueOrDash(model.quantization)}</td>
      <td className="hidden px-4 py-3 text-sm text-slate-600 md:table-cell">{valueOrDash(model.architecture)}</td>
      <td className="hidden px-4 py-3 text-sm text-slate-600 lg:table-cell">{valueOrDash(model.modified)}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{valueOrDash(model.size)}</td>
      <td className="px-4 py-3 text-right">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
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

  const modelRefs = useMemo(() => models.filter((model) => !model.id.startsWith('sha256:')).length, [models]);
  const installedBackends = status?.backends.filter((backend) => backend.installed).length ?? 0;
  const runningBackends = status?.backends.filter((backend) => backend.running).length ?? 0;

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

  async function handlePull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedModel = modelInput.trim();
    setError('');
    setBusyAction('pull');
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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-panel">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">DMR Dashboard</h1>
              <p className="text-sm text-slate-500">{status?.cli ?? 'docker model'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill ok={Boolean(status?.ok)} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
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
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-base font-semibold text-slate-950">Backends</h2>
              <p className="text-sm text-slate-500">Installed and running inference engines</p>
            </div>
            {status?.backends.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                <Box className="h-9 w-9 text-slate-300" />
                <p className="text-sm text-slate-500">No backend status reported.</p>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-base font-semibold text-slate-950">Loaded models</h2>
              <p className="text-sm text-slate-500">Models currently held in runner memory</p>
            </div>
            {loadedModels.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                <Power className="h-9 w-9 text-slate-300" />
                <p className="font-medium text-slate-900">No models loaded</p>
                <p className="text-sm text-slate-500">Models appear here while they are active in memory.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Models</h2>
              <p className="text-sm text-slate-500">Local DMR model inventory</p>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handlePull}>
              <div className="relative">
                <input
                  className="h-10 w-full min-w-64 rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  list="suggested-models"
                  disabled={busyAction === 'pull'}
                  onChange={(event) => setModelInput(event.target.value)}
                  placeholder="ai/smollm2"
                  value={modelInput}
                />
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
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
            <div className="border-b border-slate-200 bg-slate-50/70 p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pull activity</p>
                  <p className="text-xs text-slate-500">
                    {pullState === 'running'
                      ? `Downloading ${modelInput.trim()} with Docker Model Runner`
                      : pullState === 'success'
                        ? 'Download complete; model inventory refreshed'
                        : 'Docker Model Runner could not complete the pull'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={classNames(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      pullState === 'running' && 'bg-cyan-100 text-cyan-700',
                      pullState === 'success' && 'bg-emerald-100 text-emerald-700',
                      pullState === 'error' && 'bg-rose-100 text-rose-700'
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
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
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

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={classNames(
                    'h-full rounded-full transition-all duration-300',
                    pullState === 'error' ? 'bg-rose-500' : 'bg-cyan-600',
                    pullState === 'running' && pullPercent === undefined && 'animate-pulse'
                  )}
                  style={{ width: `${pullPercent ?? (pullState === 'error' ? 100 : 35)}%` }}
                />
              </div>

              <div className="mt-3 max-h-44 overflow-y-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200">
                {pullMessages.map((message, index) => (
                  <div key={`${index}:${message}`}>{message}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
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
              <Cpu className="h-10 w-10 text-slate-300" />
              <div>
                <p className="font-medium text-slate-900">No local models found</p>
                <p className="text-sm text-slate-500">Pull a model to populate this table.</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
