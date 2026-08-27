# Dockyard Docker Commands

Run these commands from the project root:

```powershell
cd D:\dockyard
```

## Docker Status

```powershell
docker info
```

Checks whether Docker CLI can talk to Docker Engine.

## Compose Config

```powershell
docker compose config
```

Reads `compose.yaml` and prints the final resolved Compose configuration.

## Build Images

```powershell
docker compose build
```

Builds the Dockyard images from the Dockerfiles.

Compose reads the `build.target` values in `compose.yaml`:

```text
backend service -> backend Dockerfile api target
worker service  -> backend Dockerfile worker target
```

## Build Backend API Image Directly

```powershell
docker build --target api -t dockyard-api:dev ./backend
```

Milestone 11 builds only the `api` target from `backend/Dockerfile`.

Simple meaning:

```text
Use the backend Dockerfile,
stop at the stage named api,
save the result as dockyard-api:dev.
```

## Build Backend Worker Image Directly

```powershell
docker build --target worker -t dockyard-worker:dev ./backend
```

Milestone 11 builds only the `worker` target from the same backend Dockerfile.

The API and worker share dependency/setup layers, but each final target has its own `CMD`.

## Inspect Backend Image History

```powershell
docker history dockyard-api:dev
```

Shows the image layers that make up `dockyard-api:dev`.

For milestone 11, use this to notice that dependency install and source copy are separate layers.

## Start Containers

```powershell
docker compose up -d
```

Starts the Compose containers in the background.

This uses only `compose.yaml`, which is the runtime-like base mode.
In this mode, app containers run from built image contents, not source bind mounts.

## Check Dev Compose Config

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config
```

Milestone 10 reads the base Compose file, then layers the dev override on top.

The dev override adds:

```text
source bind mounts
node_modules named volumes
PostgreSQL host publishing
dev server commands
```

## Start Dev Containers

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Starts Dockyard in development mode.

In dev mode, source folders from your laptop are mounted into containers:

```text
./backend  -> /app
./frontend -> /app
```

Simple meaning:

```text
edit files on your laptop,
the container sees those edits at /app
```

Milestone 10 also uses named volumes for dependencies:

```text
backend-node-modules  -> /app/node_modules
frontend-node-modules -> /app/node_modules
```

This keeps container-installed packages separate from your source bind mounts.

The `--build` flag tells Compose:

```text
build the dev images before starting containers
```

Milestone 10 uses separate dev images for the bind-mount workflow, so `--build` keeps Docker from reusing an older runtime image by accident.

## Stop Dev Containers

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down
```

Stops the dev-mode containers.

It keeps named volumes unless you add `-v`.

## Show Containers

```powershell
docker compose ps
```

Shows the Dockyard containers and published ports.

## Show Docker Volumes

```powershell
docker volume ls
```

Shows Docker-managed storage volumes.

Milestone 5 adds a PostgreSQL named volume:

```text
dockyard_postgres-data
```

That volume stores the database files outside the PostgreSQL container.
Deleting only the container should not delete the database records.

## Open PostgreSQL Shell

```powershell
docker compose exec postgres psql -U dockyard -d dockyard
```

Opens a PostgreSQL prompt inside the running `postgres` container.

Inside that prompt, this command lists tables:

```sql
\dt
```

Milestone 5 should show:

```text
deployments
deployment_logs
worker_heartbeat
```

## Stop Containers But Keep Volumes

```powershell
docker compose down
```

Stops and removes the Compose containers and network.

It does not remove the PostgreSQL named volume, so durable database data should remain.

## Stop Containers And Delete Volumes

```powershell
docker compose down -v
```

Stops containers and deletes Compose volumes.

Be careful: in Milestone 5, `-v` intentionally deletes the PostgreSQL database volume and resets durable state.

## Show Worker Logs

```powershell
docker compose logs --tail=20 worker
```

Shows the last 20 log lines from the worker container.

Milestone 7 uses worker logs to confirm the background process is running, writing heartbeats, and consuming queued Redis jobs.

## Inspect Worker Heartbeat

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT worker_id, last_seen_at, note FROM worker_heartbeat;"
```

Shows the heartbeat row written by the worker.

The heartbeat is app-level liveness:

```text
The worker process writes "I am alive" into PostgreSQL.
The backend reads that timestamp and decides if it is fresh or stale.
```

This is different from Docker container status. A container can be running while the application inside it is stuck, so Dockyard does not fake worker liveness from Docker Engine inspection.

## Open Redis CLI

```powershell
docker compose exec redis redis-cli
```

Opens the Redis command-line tool inside the running `redis` container.

Redis is not published to your laptop with a `ports:` entry. This command works because it enters the Redis container first, then talks to Redis from inside Docker.

Milestone 6 uses this list key for temporary queued deployment jobs:

```text
dockyard:queue:deployments
```

Inside `redis-cli`, this command checks how many jobs are waiting:

```text
LLEN dockyard:queue:deployments
```

This command shows the queued JSON values:

```text
LRANGE dockyard:queue:deployments 0 -1
```

## Show Redis Logs

```powershell
docker compose logs --tail=20 redis
```

Shows Redis container logs.

Milestone 6 reminder:

```text
Redis is temporary queue state.
PostgreSQL is durable source-of-truth state.
```

## Show Dockyard Images

```powershell
docker images --filter reference=dockyard-*
```

Shows Dockyard images built so far.

Expected image names include:

```text
dockyard-api:dev
dockyard-worker:dev
dockyard-frontend:dev
```

## Check Backend Through Published Port

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Calls the backend health endpoint through the published backend port.

## Check Worker Status Through Backend

```powershell
Invoke-RestMethod http://localhost:8080/platform-services/worker
```

Calls the backend API and asks it to read the worker heartbeat from PostgreSQL.

Milestone 7 uses this to avoid pretending the dashboard can inspect Docker directly.

## Create A Fake Deployment

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"name":"demo deployment"}' http://localhost:8080/deployments
```

Creates a durable deployment record in PostgreSQL, then queues a temporary Redis job for the worker.

Milestone 8 order matters:

```text
PostgreSQL deployment record first.
Redis queued job second.
```

If Redis later loses temporary queue state, PostgreSQL still has the deployment record.

## Inspect Deployment Tables

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status, created_at, updated_at FROM deployments ORDER BY id DESC;"
```

Shows durable deployment records.

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT deployment_id, level, message, created_at FROM deployment_logs ORDER BY id DESC LIMIT 20;"
```

Shows durable application/domain logs for deployments.

## Check Frontend Through Published Port

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000
```

Checks that the frontend is being served through the published frontend port.

## Important Order

Run this before checking `localhost:8080` or `localhost:3000`:

```powershell
docker compose up -d
```

Without running containers, the published ports do not have anything to answer.
