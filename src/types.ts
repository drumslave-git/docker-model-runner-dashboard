export type ApiStatus = {
  ok: boolean;
  cli: string;
  latencyMs: number;
  status?: string;
  running?: boolean;
  kind?: string;
  endpoint?: string;
  endpointHost?: string;
  backends: DmrBackend[];
  error?: unknown;
};

export type DmrBackend = {
  name: string;
  installed: boolean;
  running: boolean;
  detail: string;
};

export type LoadedModel = {
  id: string;
  displayName: string;
  backend?: string;
  mode?: string;
  until?: string;
};

export type DmrModel = {
  id: string;
  displayName: string;
  name: string;
  namespace: string;
  tag?: string;
  digest?: string;
  modified?: string;
  size?: string;
  parameters?: string;
  quantization?: string;
  architecture?: string;
  raw: unknown;
};

export type CatalogModel = {
  name: string;
  description: string;
  downloads: number;
  stars: number;
  source: string;
  official: boolean;
  updatedAt?: string;
  backend?: string;
  size?: number;
};

export type CatalogTag = {
  name: string;
  size?: number;
  updatedAt?: string;
  digest?: string;
};
