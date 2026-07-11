export type ApiStatus = {
  ok: boolean;
  cli: string;
  latencyMs: number;
  status?: string;
  error?: unknown;
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
