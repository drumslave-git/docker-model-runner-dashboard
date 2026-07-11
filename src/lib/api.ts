import type { ApiStatus, DmrModel } from '../types';

type JsonRecord = Record<string, unknown>;

export type PullProgressEvent = {
  type: 'progress' | 'complete' | 'error';
  message: string;
  stream?: 'stdout' | 'stderr';
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    const message = typeof payload.detail === 'string' && payload.detail ? `${error}: ${payload.detail}` : error;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function formatBytes(value: unknown): string | undefined {
  const bytes = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return undefined;
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleString();
}

function firstUsableTag(record: JsonRecord) {
  return [
    ...asStringArray(record.tags),
    ...asStringArray(record.Tags),
    ...asStringArray(record.repoTags),
    ...asStringArray(record.RepoTags)
  ].find((tag) => tag !== '<none>:<none>' && !tag.startsWith('sha256:'));
}

function usableReference(value: unknown) {
  const reference = asString(value);
  return reference && !reference.startsWith('sha256:') ? reference : undefined;
}

function firstUsableReference(record: JsonRecord) {
  const repository = usableReference(record.repository) ?? usableReference(record.Repository) ?? usableReference(record.repo);
  const tag = asString(record.tag) ?? asString(record.Tag);

  if (repository && tag && tag !== 'latest') {
    return `${repository}:${tag}`;
  }

  return (
    repository ??
    usableReference(record.model) ??
    usableReference(record.name) ??
    usableReference(record.reference) ??
    usableReference(record.ref) ??
    firstUsableTag(record)
  );
}

function splitReference(reference: string) {
  const [namespace = 'library', rest] = reference.includes('/') ? reference.split(/\/(.+)/) : ['library', reference];
  const [name, tag] = rest.split(/:(.+)/);

  return { namespace, name, tag };
}

function normalizeOne(raw: unknown): DmrModel | undefined {
  if (typeof raw === 'string') {
    const { namespace, name, tag } = splitReference(raw);

    return {
      id: raw,
      displayName: raw,
      name,
      namespace,
      tag,
      raw
    };
  }

  const record = asRecord(raw);
  const config = asRecord(record.config ?? record.Config);
  const idField = asString(record.id);
  const digest =
    asString(record.digest) ??
    asString(record.Digest) ??
    idField;
  const reference = firstUsableReference(record);

  if (!reference && !digest) {
    return undefined;
  }

  const id = reference ?? digest!;
  const parsed = reference ? splitReference(reference) : { namespace: 'digest', name: digest!, tag: undefined };

  return {
    id,
    displayName: reference ?? digest!,
    name: parsed.name,
    namespace: parsed.namespace,
    tag: reference ? asString(record.tag) ?? asString(record.Tag) ?? parsed.tag : undefined,
    digest,
    modified:
      asString(record.modified) ?? asString(record.modified_at) ?? formatTimestamp(record.created ?? record.Created),
    size:
      asString(record.size) ??
      asString(config.size) ??
      formatBytes(record.size_bytes ?? record.Size ?? config.size_bytes ?? config.Size),
    parameters: asString(record.parameters) ?? asString(config.parameters),
    quantization: asString(record.quantization) ?? asString(config.quantization),
    architecture: asString(record.architecture) ?? asString(config.architecture),
    raw
  };
}

export function normalizeModels(payload: unknown): DmrModel[] {
  const record = asRecord(payload);
  const rawModels = record.models ?? record.data ?? payload;
  const list = Array.isArray(rawModels) ? rawModels : [];

  return list
    .map(normalizeOne)
    .filter((model): model is DmrModel => Boolean(model))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getStatus() {
  return request<ApiStatus>('/api/status');
}

export async function getModels() {
  const response = await request<{ source: string; models: unknown }>('/api/models');
  return normalizeModels(response.models);
}

export async function pullModel(model: string, onProgress: (event: PullProgressEvent) => void) {
  const response = await fetch('/api/models', {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(error);
  }

  if (!response.body) {
    throw new Error('Pull progress stream is unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const consumeLine = (line: string) => {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line) as PullProgressEvent;
    onProgress(event);

    if (event.type === 'error') {
      throw new Error(event.message);
    }

    if (event.type === 'complete') {
      completed = true;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);

      if (done) {
        break;
      }
    }

    consumeLine(buffer);
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
  }

  if (!completed) {
    throw new Error('Pull ended before Docker reported completion');
  }
}

export async function deleteModel(model: string) {
  const [namespace, name] = model.split(/\/(.+)/);
  return request(`/api/models/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
}
