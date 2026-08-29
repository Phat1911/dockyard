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

## Check Registry Compose Config

```powershell
docker compose -f compose.registry.yaml config
```

Milestone 20 reads only the local registry Compose file.

Simple meaning:

```text
registry:2 runs a small image-storage service
localhost:5000 is the published doorway from your laptop to that service
```

## Build Images

```powershell
docker compose build
```

Builds the Dockyard images from the Dockerfiles.

Compose reads the `build.target` values in `compose.yaml`:

```text
backend service -> backend Dockerfile api target
worker service  -> backend Dockerfile worker target
frontend service -> frontend Dockerfile runtime target
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

## Build Frontend Runtime Image Directly

```powershell
docker build -t dockyard-frontend:dev ./frontend
```

Milestone 12 builds the frontend runtime image.

Simple meaning:

```text
Use Node.js during the build,
copy only the built dist files into Nginx,
save the result as dockyard-frontend:dev.
```

## Inspect Frontend Image History

```powershell
docker history dockyard-frontend:dev
```

Shows the image layers that make up `dockyard-frontend:dev`.

For milestone 12, use this to check the runtime image is based on Nginx and receives built static assets from the builder stage.

## Start Containers

```powershell
docker compose up -d
```

Starts the Compose containers in the background.

This uses only `compose.yaml`, which is the runtime-like base mode.
In this mode, app containers run from built image contents, not source bind mounts.

Milestone 19 adds bounded restart policies in this base mode:

```text
restart: "on-failure:3"
```

Simple meaning:

```text
if the service process crashes, Docker retries it
after a few failed retries, the failure stays visible
```

Milestone 15 uses this command to verify the app works without `compose.dev.yaml`.

Simple meaning:

```text
no ./backend:/app
no ./frontend:/app
no dev node_modules volumes
```

If you edit source code after starting runtime-like mode, rebuild before expecting the container to see it:

```powershell
docker compose up -d --build
```

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

This is intentionally different from runtime-like mode. Dev mode favors fast editing; runtime-like mode favors checking what the built images actually contain.

The `--build` flag tells Compose:

```text
build the dev images before starting containers
```

Milestone 10 uses separate dev images for the bind-mount workflow, so `--build` keeps Docker from reusing an older runtime image by accident.

## Check Proxy Compose Config

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml config
```

Milestones 17 and 18 read the base Compose file, then layer the proxy override on top.

Simple meaning:

```text
compose.yaml says how the normal stack works
compose.proxy.yaml changes the public doorway to Nginx
```

In proxy mode after milestone 18:

```text
nginx publishes localhost:3000 and joins the public network
frontend has no direct host port and joins the public network
backend has no direct host port and joins public + private networks
postgres, redis, and worker join the private network
```

Nginx can still reach `frontend:8080` and `backend:8080` because those services share the public network. Nginx does not share the private network with PostgreSQL or Redis.

## Show Docker Networks

```powershell
docker network ls
```

Shows Docker networks on your machine.

Milestone 18 splits proxy mode into:

```text
dockyard_public
dockyard_private
```

## Inspect Dockyard Network

```powershell
docker network inspect dockyard_public
docker network inspect dockyard_private
```

Shows which containers are attached to each Dockyard proxy-mode network.

Simple meaning:

```text
dockyard_public  -> nginx, frontend, backend
dockyard_private -> backend, postgres, redis, worker
```

## Check Proxy Network Separation

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml exec nginx getent hosts backend
docker compose -f compose.yaml -f compose.proxy.yaml exec nginx getent hosts postgres
docker compose -f compose.yaml -f compose.proxy.yaml exec backend getent hosts postgres
```

Milestone 18 uses these commands to test service-name discovery from inside containers.

Expected meaning:

```text
nginx can find backend because both are on dockyard_public
nginx should not find postgres because nginx is not on dockyard_private
backend can find postgres because backend is on dockyard_private too
```

If `getent hosts postgres` from `nginx` returns nothing, that is good for this milestone. It means Nginx is not in the private database room.

## Start Proxy Containers

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml up -d --build
```

Starts Dockyard with Nginx as the reverse proxy.

Simple meaning:

```text
Your browser talks to Nginx.
Nginx forwards page requests to frontend.
Nginx forwards /api requests to backend.
```

Open the dashboard through the proxy:

```text
http://localhost:3000
```

Check backend health through the proxy:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

The old direct backend URL should not be the normal path in proxy mode:

```text
http://localhost:8080
```

Milestone 17 removes the backend host port in `compose.proxy.yaml`, so the backend is private to Docker while Nginx remains public.

## Show Proxy Containers

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml ps
```

Shows the proxy-mode containers and published ports.

Use this to confirm:

```text
nginx has a published port
backend does not show 0.0.0.0:8080->8080
frontend does not show 0.0.0.0:3000->8080
```

## Show Proxy Logs

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml logs --tail=20 nginx
```

Shows Nginx proxy logs.

For a routing problem, also compare:

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml logs --tail=20 frontend
docker compose -f compose.yaml -f compose.proxy.yaml logs --tail=20 backend
```

Nginx logs show what the public gateway received.
Frontend and backend logs show what the private services handled.

## Stop Proxy Containers

```powershell
docker compose -f compose.yaml -f compose.proxy.yaml down
```

Stops proxy-mode containers while keeping the PostgreSQL named volume.

It does not delete durable database data unless you add `-v`.

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

Milestone 13 adds health checks, so this command can also show whether services are healthy or unhealthy.

Simple meaning:

```text
running/started tells you the process exists
healthy tells you the service passed its readiness check
```

## Inspect Container Health

```powershell
docker inspect dockyard-backend-1
```

Shows detailed container metadata, including health check results.

Useful health paths in the output:

```text
State.Status
State.Health.Status
State.Health.Log
```

Use the same pattern for PostgreSQL or Redis:

```powershell
docker inspect dockyard-postgres-1
docker inspect dockyard-redis-1
```

Milestone 13 uses health checks so Compose can wait for a service to be useful, not just started.

## Watch Resource Usage

```powershell
docker stats
```

Milestone 14 uses this command to show live resource usage for running containers.

Important columns:

```text
CPU %              current CPU use
MEM USAGE / LIMIT  current memory use compared to the configured limit
MEM %              percentage of the memory limit currently used
```

Example meaning:

```text
45MiB / 256MiB
```

The container is using `45MiB` of memory, and Docker will limit it around `256MiB`.

## Inspect Resource Limits

```powershell
docker inspect dockyard-worker-1
```

Look for:

```text
HostConfig.NanoCpus
HostConfig.Memory
```

Simple meaning:

```text
NanoCpus shows the configured CPU boundary.
Memory shows the configured memory boundary in bytes.
```

You can inspect the other services the same way:

```powershell
docker inspect dockyard-frontend-1
docker inspect dockyard-backend-1
docker inspect dockyard-postgres-1
docker inspect dockyard-redis-1
```

## Enable Worker CPU Stress For Stats

PowerShell:

```powershell
$env:WORKER_STRESS_MODE="cpu"
$env:WORKER_STRESS_DURATION_MS="2000"
docker compose up -d --build worker
```

This keeps the worker stress mode opt-in.

Simple meaning:

```text
The worker does a short CPU burst during each tick.
Then docker stats has something visible to show.
```

Turn it off again:

```powershell
$env:WORKER_STRESS_MODE="off"
docker compose up -d worker
```

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

## Inspect PostgreSQL Volume

```powershell
docker volume inspect dockyard_postgres-data
```

Shows Docker metadata for the PostgreSQL named volume.

Simple meaning:

```text
Docker can show that the volume exists separately from the postgres container.
```

Milestone 16 uses this before discussing volume deletion, because deleting a volume is different from deleting a container.

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

## Stop One Service Container

```powershell
docker compose stop worker
docker compose stop redis
docker compose stop postgres
```

Stops one Compose service container without removing it.

Simple meaning:

```text
the container process stops
the container record still exists
named volumes are kept
```

Milestone 16 uses this to create controlled failures, such as a stale worker heartbeat or a Redis restart/recreate drill.

Milestone 19 reminder:

```text
docker compose stop worker
```

is a manual stop. The `on-failure:3` restart policy is for error exits, not for this intentional stop.

## Manually Restart A Service

```powershell
docker compose restart worker
```

Restarts one service container by request.

Simple meaning:

```text
stop the worker process
start it again
keep the PostgreSQL named volume
```

This is different from an automatic restart policy. Here, you are asking Docker to restart the service. With `restart: "on-failure:3"`, Docker reacts only after the container's main process exits with an error.

## Inspect Restart Policy And Count

```powershell
docker inspect dockyard-worker-1
```

Milestone 19 uses this command to see whether Docker restarted a container.

Look for:

```text
HostConfig.RestartPolicy
RestartCount
State.Status
State.StartedAt
State.FinishedAt
State.ExitCode
```

Simple meaning:

```text
HostConfig.RestartPolicy -> what Docker is allowed to restart
RestartCount             -> how many times Docker restarted this container
State.ExitCode           -> the last process exit code
```

## Observe A Crash Loop

```powershell
docker compose logs --tail=50 worker
docker inspect dockyard-worker-1
docker compose ps
```

A crash loop means:

```text
container starts
app crashes
Docker restarts it
app crashes again
```

The logs reveal the loop because the same startup and error lines repeat. `docker inspect` reveals it because `RestartCount` increases.

Important distinction:

```text
restart policy reacts to exited containers
healthcheck reports whether a running container is usable
```

So a backend can be:

```text
Up (unhealthy)
```

without Docker automatically restarting it. That usually means the process is still alive, but something it needs is broken, such as PostgreSQL, Redis, networking, or the health check command.

## Remove A Stopped Service Container

```powershell
docker compose rm -f redis
docker compose rm -f postgres
```

Removes a stopped Compose service container.

Simple meaning:

```text
delete the container
keep Docker named volumes unless you explicitly delete volumes too
```

Milestone 16 uses this to show an important difference:

```text
Redis has no named volume, so its temporary queue state can disappear.
PostgreSQL has a named volume, so deleting only the postgres container should not delete database rows.
```

## Run Database Migrations

```powershell
docker compose exec backend npm run migrate
```

Milestone 21 runs the migration script from inside the backend container.

Simple meaning:

```text
backend container runs npm run migrate
migration code connects to PostgreSQL
new migration files upgrade the existing schema in dockyard_postgres-data
old deployment rows stay in the PostgreSQL volume
```

The migration runner records completed files in this table:

```text
schema_migrations
```

That tracking makes migrations idempotent, or safe to run again. If a migration file is already listed in `schema_migrations`, the next `npm run migrate` skips it.

Check the tracking table:

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT name, applied_at FROM schema_migrations ORDER BY name;"
```

Check the new column added by the milestone 21 migration:

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'deployments' AND column_name = 'environment';"
```

Simple meaning:

```text
PostgreSQL should show the environment column.
Existing deployment rows should still be in the deployments table.
```

Milestone 21 warning:

```text
Do not use `docker compose down -v` for schema upgrades.
```

`docker compose down -v` deletes the PostgreSQL named volume. That resets durable database data instead of upgrading the existing schema.

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
dockyard-frontend-proxy:dev
```

## Start Local Registry

```powershell
docker compose -f compose.registry.yaml up -d
```

Milestone 20 starts a local Docker registry.

Simple meaning:

```text
registry = a server that stores built Docker images
Git repo = source code and file history
```

The registry service uses:

```text
registry:2
```

That means:

```text
image name = registry
image tag  = 2
```

It publishes port `5000`:

```text
localhost:5000 on your laptop -> port 5000 inside the registry container
```

That published port matters because `docker tag`, `docker push`, and `docker pull` are run from your laptop's Docker CLI.

## Tag Image For Local Registry

Run this yourself for milestone 20:

```powershell
docker tag dockyard-api:dev localhost:5000/dockyard-api:milestone-20
```

Simple meaning:

```text
Take the existing local image dockyard-api:dev.
Add another name that points at the local registry.
```

The new tag has three important parts:

```text
localhost:5000  -> registry address
dockyard-api    -> image name inside the registry
milestone-20    -> version/label
```

## Push Image To Local Registry

Run this yourself for milestone 20:

```powershell
docker push localhost:5000/dockyard-api:milestone-20
```

Simple meaning:

```text
Upload the tagged image layers into the registry container.
```

The local registry stores those pushed image blobs in the `dockyard_registry-data` named volume.

## Pull Image From Local Registry

Run this yourself for milestone 20:

```powershell
docker pull localhost:5000/dockyard-api:milestone-20
```

Simple meaning:

```text
Ask Docker to download that image tag from the local registry.
```

If the image already exists locally, Docker may say the layers already exist. That is still useful: it proves Docker can contact the registry and resolve the tag.

## Show Registry Image Tags

Run this yourself for milestone 20:

```powershell
docker images
```

Look for:

```text
localhost:5000/dockyard-api   milestone-20
```

That line means your local Docker image list knows about the registry-style tag.

## Stop Local Registry

```powershell
docker compose -f compose.registry.yaml down
```

Stops the registry container but keeps the `dockyard_registry-data` named volume.

Careful:

```powershell
docker compose -f compose.registry.yaml down -v
```

also deletes the registry volume, so pushed local-registry image data is removed.

## Check Backend Through Published Port

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Calls the backend health endpoint through the published backend port.

Milestone 13 changes this endpoint from a simple "backend process exists" answer into a dependency check:

```text
backend healthy = backend answers HTTP + PostgreSQL answers + Redis answers
```

If PostgreSQL or Redis is unreachable, `/health` returns an unhealthy response.

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

Milestone 12 maps your laptop port to container port `8080`:

```text
localhost:3000 -> frontend container port 8080
```

The container uses port `8080` because non-root processes normally cannot listen on low ports like `80`.

## Important Order

Run this before checking `localhost:8080` or `localhost:3000`:

```powershell
docker compose up -d
```

Without running containers, the published ports do not have anything to answer.

## Milestone 16 Debugging Exercises

The full guided pack lives in:

```text
MILESTONE_16_DEBUGGING.md
```

Milestone 16 uses the same Docker commands from this file, but puts them into controlled break/fix drills.

Simple rule:

```text
break one thing
observe it with Docker commands
fix that one thing
verify the stack is healthy again
```

Start clean:

```powershell
docker compose up -d --build
docker compose ps
```

Main commands used by the exercises:

```powershell
docker compose ps
docker compose logs
docker inspect dockyard-backend-1
docker inspect dockyard-postgres-1
docker inspect dockyard-redis-1
docker volume ls
docker volume inspect dockyard_postgres-data
```

Temporary environment-variable breaks:

```powershell
$env:BACKEND_HOST_PORT="18080"
$env:DATABASE_URL="postgres://dockyard:dockyard_dev_password@localhost:5432/dockyard"
```

Undo those temporary values:

```powershell
Remove-Item Env:BACKEND_HOST_PORT -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

Careful PostgreSQL reminder:

```powershell
docker compose down
```

stops containers while keeping volumes.

```powershell
docker compose down -v
```

stops containers and deletes Compose volumes. In Dockyard, that intentionally deletes the PostgreSQL named volume and resets durable local database data.
