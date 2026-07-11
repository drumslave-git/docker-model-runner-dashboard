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

The Compose service mounts `/var/run/docker.sock` so the dashboard's bundled
Docker CLI and Model Runner plugin can manage models in the host Docker engine.
Access to this socket is equivalent to administrative access to Docker; only run
the dashboard in an environment you trust and do not expose the selected host
port publicly.

## Run without Compose

```sh
docker build -t docker-model-runner-dashboard .
docker run --rm -p 8787:8787 \
  -v /var/run/docker.sock:/var/run/docker.sock \
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
