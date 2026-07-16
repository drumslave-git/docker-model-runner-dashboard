# Docker Model Runner Dashboard

A web dashboard for inspecting and managing models in Docker Model Runner.

The dashboard can also search the Docker Hub model catalog, list every available
tag for a selected model, and pull a specific variant with streamed progress.

## Run with Docker Compose

Prerequisites:

- Docker Desktop 4.41 or newer on Windows, or a Docker Engine installation with Docker Model Runner
- Docker Model Runner enabled and running
- Linux containers when using Docker Desktop

Build and start the dashboard:

```sh
docker compose up --build -d
```

Open <http://localhost:8787>.

To publish the dashboard on another host port, set `HOST_PORT` in `.env` before
starting Compose:

```env
HOST_PORT=9090
```

The dashboard will then be available at <http://localhost:9090>. The container
continues to listen internally on port 8787.

Stop it with:

```sh
docker compose down
```

## Pointing the dashboard at a Model Runner

The bundled `docker model` plugin is a thin HTTP client for the Docker Model
Runner API — every command (`ps`, `list`, `status`, `pull`) is a request to that
API rather than a local operation. Inside a container, `localhost` is the
container itself, so the runner has to be addressed explicitly via
`MODEL_RUNNER_URL`. Left unset, the plugin falls back to `localhost:12434` and
fails with `connection refused`.

`MODEL_RUNNER_URL` is this dashboard's setting; the plugin itself reads
`MODEL_RUNNER_HOST`. The server translates the former into the latter when it
invokes the CLI, so `MODEL_RUNNER_URL` is the only one you need to set.

The plugin can also auto-detect a runner through `/var/run/docker.sock`, but
that path is unreliable across hosts: on Docker Desktop it resolves correctly,
while on Docker Engine it resolves to `localhost:12434` and fails from inside a
container. The dashboard therefore always sets the address explicitly and does
not mount the socket — which also avoids handing the container administrative
access to the Docker daemon.

Compose defaults to `http://model-runner.docker.internal`, the address Docker
Desktop exposes to containers. Set `MODEL_RUNNER_URL` in `.env` for any other
host:

```env
# Runner running as a container: join its network and use its container name
MODEL_RUNNER_URL=http://docker-model-runner:12434

# Runner published on the Docker Engine host's port 12434. Also add
# `host.docker.internal:host-gateway` to the service's extra_hosts.
MODEL_RUNNER_URL=http://host.docker.internal:12434

# Remote runner
MODEL_RUNNER_URL=https://dmr.example.com
```

The dashboard can pull and remove models on whichever runner it points at, so
run it only in an environment you trust, and put authentication in front of it
before exposing it on a public hostname.

## Run without Compose

```sh
docker build -t docker-model-runner-dashboard .
docker run --rm -p 8787:8787 \
  -e MODEL_RUNNER_URL=http://model-runner.docker.internal \
  docker-model-runner-dashboard
```

## Local development

```sh
npm install
npm run dev
```

The Vite development server is available at <http://localhost:5300> and mounts
the API middleware in the same process.

## Versions and Docker Hub releases

The `version` in `package.json` is the source of truth and follows SemVer. Use
one of these commands to update both `package.json` and `package-lock.json`:

```sh
npm run version:patch
npm run version:minor
npm run version:major
```

Check the version and lockfile locally with `npm run version:check`.

When a higher version reaches `main`, the GitHub Actions workflow publishes the
image to Docker Hub. Stable releases are tagged with the full version, minor
line, major line, and `latest` (for example, `1.4.2`, `1.4`, `1`, and `latest`).
Prereleases such as `2.0.0-beta.1` receive only the exact prerelease tag.

Configure these GitHub repository secrets before the first release:

- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token

By default the image is published as
`DOCKERHUB_USERNAME/docker-model-runner-dashboard`. To use another Docker Hub
repository, set the optional GitHub repository variable
`DOCKERHUB_REPOSITORY` to its full `namespace/name`.
