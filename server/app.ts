import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import cors from 'cors';
import express from 'express';

loadDotEnv();

const execFileAsync = promisify(execFile);
const dmrCliPath = process.env.DMR_CLI_PATH?.trim() || 'docker';

type DmrCommandOptions = {
  timeoutMs?: number;
};

class DmrCliError extends Error {
  detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.detail = detail;
  }
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function commandErrorDetail(error: unknown) {
  if (!error || typeof error !== 'object') {
    return String(error || 'Unknown Docker Model Runner CLI error');
  }

  const commandError = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
  const output = commandError.stderr?.trim() || commandError.stdout?.trim();

  if (output) {
    return output;
  }

  if (commandError.code === 'ENOENT') {
    return `Docker CLI was not found at "${dmrCliPath}"`;
  }

  return commandError.message || 'Docker Model Runner CLI command failed';
}

async function runDmrCommand(args: string[], options: DmrCommandOptions = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(dmrCliPath, ['model', ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeoutMs ?? 120000,
      windowsHide: true
    });

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    throw new DmrCliError('Docker Model Runner CLI command failed', commandErrorDetail(error));
  }
}

function parseJsonOutput(output: string) {
  if (!output) {
    return [];
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    try {
      return output
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new DmrCliError('Docker Model Runner returned invalid JSON', output);
    }
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeBackends(value: unknown) {
  return Object.entries(asRecord(value))
    .map(([name, rawDetail]) => {
      const detail = String(rawDetail ?? '').trim() || 'Unknown';
      const installed = !/^not installed\b/i.test(detail);
      const running = /^running\b/i.test(detail);

      return { name, installed, running, detail };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parseLoadedModels(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).flatMap((line) => {
    const [displayName, backend, mode, ...untilParts] = line.split(/\s{2,}/).map((value) => value.trim());

    if (!displayName) {
      return [];
    }

    return [
      {
        id: displayName,
        displayName,
        backend: backend || undefined,
        mode: mode || undefined,
        until: untilParts.join('  ') || undefined
      }
    ];
  });
}

function handleError(response: express.Response, error: unknown) {
  if (error instanceof DmrCliError) {
    response.status(502).json({ error: error.message, detail: error.detail });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  response.status(500).json({ error: message });
}

type PullEvent = {
  type: 'progress' | 'complete' | 'error';
  message: string;
  stream?: 'stdout' | 'stderr';
};

function writePullEvent(response: express.Response, event: PullEvent) {
  if (!response.writableEnded) {
    response.write(`${JSON.stringify(event)}\n`);
  }
}

function stripTerminalFormatting(value: string) {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function createDmrApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/status', async (_request, response) => {
    const startedAt = performance.now();

    try {
      const result = await runDmrCommand(['status', '--json'], { timeoutMs: 10000 });
      const status = asRecord(parseJsonOutput(result.stdout));
      const running = status.running === true;
      response.json({
        ok: running,
        cli: 'docker model',
        latencyMs: Math.round(performance.now() - startedAt),
        status: result.stdout,
        running,
        kind: typeof status.kind === 'string' ? status.kind : undefined,
        endpoint: typeof status.endpoint === 'string' ? status.endpoint : undefined,
        endpointHost: typeof status.endpointHost === 'string' ? status.endpointHost : undefined,
        backends: normalizeBackends(status.backends)
      });
    } catch (error) {
      response.status(200).json({
        ok: false,
        cli: 'docker model',
        latencyMs: Math.round(performance.now() - startedAt),
        backends: [],
        error: error instanceof DmrCliError ? error.detail : commandErrorDetail(error)
      });
    }
  });

  app.get('/api/loaded-models', async (_request, response) => {
    try {
      const result = await runDmrCommand(['ps'], { timeoutMs: 30000 });
      response.json({ source: 'cli', models: parseLoadedModels(result.stdout) });
    } catch (error) {
      handleError(response, error);
    }
  });

  app.delete('/api/loaded-models', async (request, response) => {
    const model = String(request.body?.model ?? '').trim();
    const backend = String(request.body?.backend ?? '').trim();

    if (!model) {
      response.status(400).json({ error: 'Model is required' });
      return;
    }

    try {
      const args = ['unload'];

      if (backend) {
        args.push('--backend', backend);
      }

      args.push('--', model);
      await runDmrCommand(args, { timeoutMs: 5 * 60 * 1000 });
      response.status(204).send();
    } catch (error) {
      handleError(response, error);
    }
  });

  app.get('/api/models', async (_request, response) => {
    try {
      const result = await runDmrCommand(['list', '--json'], { timeoutMs: 60000 });
      response.json({ source: 'cli', models: parseJsonOutput(result.stdout) });
    } catch (error) {
      handleError(response, error);
    }
  });

  app.post('/api/models', async (request, response) => {
    const model = String(request.body?.model ?? '').trim();

    if (!model) {
      response.status(400).json({ error: 'Model is required' });
      return;
    }

    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.flushHeaders();

    writePullEvent(response, { type: 'progress', message: `Starting docker model pull ${model}` });

    const child = spawn(dmrCliPath, ['model', 'pull', '--', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const buffers = { stdout: '', stderr: '' };
    const recentMessages: string[] = [];
    let lastMessage = '';
    let settled = false;
    let timedOut = false;

    const emitLine = (stream: 'stdout' | 'stderr', rawLine: string) => {
      const message = stripTerminalFormatting(rawLine).trim();

      if (!message || message === lastMessage) {
        return;
      }

      lastMessage = message;
      recentMessages.push(message);
      recentMessages.splice(0, Math.max(0, recentMessages.length - 12));
      writePullEvent(response, { type: 'progress', message, stream });
    };

    const consume = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      buffers[stream] += chunk.toString('utf8');
      const lines = buffers[stream].split(/\r\n|\r|\n/);
      buffers[stream] = lines.pop() ?? '';
      lines.forEach((line) => emitLine(stream, line));
    };

    const flush = () => {
      emitLine('stdout', buffers.stdout);
      emitLine('stderr', buffers.stderr);
      buffers.stdout = '';
      buffers.stderr = '';
    };

    child.stdout.on('data', (chunk: Buffer) => consume('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => consume('stderr', chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30 * 60 * 1000);

    child.on('error', (error) => {
      settled = true;
      clearTimeout(timeout);
      writePullEvent(response, { type: 'error', message: commandErrorDetail(error) });
      response.end();
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      flush();

      if (code === 0) {
        writePullEvent(response, { type: 'complete', message: `${model} pulled successfully` });
      } else {
        const detail = timedOut
          ? `Pull timed out after 30 minutes`
          : recentMessages.at(-1) || `docker model pull exited with code ${code ?? 'unknown'}`;
        writePullEvent(response, { type: 'error', message: detail });
      }

      response.end();
    });

    response.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        child.kill();
      }
    });
  });

  app.get('/api/models/:namespace/:name', async (request, response) => {
    try {
      const model = `${request.params.namespace}/${request.params.name}`;
      const result = await runDmrCommand(['inspect', '--', model], { timeoutMs: 30000 });
      response.type('text/plain').send(result.stdout);
    } catch (error) {
      handleError(response, error);
    }
  });

  app.delete('/api/models/:namespace/:name', async (request, response) => {
    try {
      const model = `${request.params.namespace}/${request.params.name}`;
      await runDmrCommand(['rm', '--', model], { timeoutMs: 5 * 60 * 1000 });
      response.status(204).send();
    } catch (error) {
      handleError(response, error);
    }
  });

  return app;
}
