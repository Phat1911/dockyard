# Dockyard Implementation Plan

This plan breaks `SPEC.md` into small implementation milestones. Each milestone is labeled by review depth:

- **Core logic**: requires deep understanding because it affects security, persistence, recovery behavior, infrastructure boundaries, or interview-relevant Docker mechanics.
- **Supporting/boilerplate**: requires quick review; Codex can handle most details after confirming behavior.

Dockyard does not handle real funds or blockchain protocol state. For this project, the core invariants are Docker-learning equivalents: durable state must not be lost accidentally, secrets must not leak into images, service boundaries must stay honest, and the dashboard must not pretend to control Docker Engine.

## Milestone 0: Clean Starting Point

**Label:** Supporting/boilerplate

Build:

- Remove the temporary root learning `Dockerfile` if it is no longer needed.
- Keep `SPEC.md`, `PLAN.md`, `AGENTS.md`, `.gitignore`, and private `LEARNING_NOTES.md`.
- Create the initial folder structure:
  - `frontend/`
  - `backend/`
  - `backend/db/`

Review:

- Confirm the repo contains only planned project files and no accidental secrets.

## Milestone 1: Minimal Backend API

**Label:** Supporting/boilerplate

Build:

- Create a Node.js Fastify backend.
- Add `GET /health`.
- Add structured stdout logs for startup and requests.
- Add a basic test command.

Review:

- Confirm the backend starts locally.
- Confirm `/health` returns a simple success response before database checks are added.

## Milestone 2: Minimal Frontend Shell

**Label:** Supporting/boilerplate

Build:

- Create a React + Vite frontend.
- Add two tabs:
  - Deployments
  - Platform Services
- Add simple API client configuration.

Review:

- Confirm the frontend runs locally.
- Confirm the UI stays simple and dashboard-focused.

## Milestone 3: Base Compose Skeleton

**Label:** Core logic

Invariant / property to preserve:

- The Compose environment must expose only the intended host ports and must not imply Docker Engine control.

Build:

- Add `compose.yaml` with:
  - `frontend`
  - `backend`
  - `postgres`
  - `redis`
  - `worker` placeholder
- Use one initial Compose network.
- Publish frontend and backend host ports.
- Keep Redis private.
- Do not mount Docker socket.

Review deeply:

- Which services are containers?
- Which ports are internal only?
- Which ports are published to the host?
- Why does no service have Docker Engine access?

Verify:

```bash
docker compose config
docker compose up
docker compose ps
```

## Milestone 4: Environment Files And Ignore Rules

**Label:** Core logic

Invariant / property to preserve:

- Secrets and local-only config must never be baked into images or committed to git.

Build:

- Add `.env.example`.
- Use `.env` values in Compose for PostgreSQL and app config.
- Ensure `.env` remains ignored.
- Add `.dockerignore` files for build contexts.

Review deeply:

- Difference between build-time files and run-time environment variables.
- Why `.env` must not be copied into Docker images.
- Why `.dockerignore` protects the build context.

Verify:

```bash
docker compose config
```

## Milestone 5: PostgreSQL Init SQL And Durable Volume

**Label:** Core logic

Invariant / property to preserve:

- Durable deployment state and domain logs must survive container replacement and only reset when the PostgreSQL volume is intentionally deleted.

Build:

- Add PostgreSQL named volume.
- Add mounted init SQL scripts.
- Create tables for:
  - deployments
  - deployment logs
  - worker heartbeat
- Add backend database connection.

Review deeply:

- Why init SQL runs only on a fresh volume.
- Difference between deleting a container and deleting a volume.
- Where deployment records are persisted.

Verify:

```bash
docker volume ls
docker compose exec postgres psql
docker compose down
docker compose up
docker compose down -v
```

## Milestone 6: Redis Queue

**Label:** Core logic

Invariant / property to preserve:

- Redis is temporary coordination only; PostgreSQL remains the source of truth for recoverable deployment state.

Build:

- Add Redis client to backend.
- Add a simple queue operation.
- Keep Redis unpersisted.
- Keep Redis private to the Docker network.

Review deeply:

- Why Redis can lose queued jobs.
- Why pending deployment records must exist in PostgreSQL before queueing work.
- Why host access to Redis is unnecessary.

Verify:

```bash
docker compose exec redis redis-cli
docker compose logs redis
```

## Milestone 7: Worker Process And Heartbeat

**Label:** Core logic

Invariant / property to preserve:

- Worker liveness must be represented honestly through application heartbeat, not fake Docker container inspection.

Build:

- Implement Node.js worker process.
- Worker consumes Redis jobs.
- Worker writes heartbeat records to PostgreSQL.
- Backend exposes worker heartbeat freshness in service status.

Review deeply:

- Why the worker exposes no port.
- Difference between Docker health and app-level heartbeat.
- How stale heartbeat differs from crashed container status.

Verify:

```bash
docker compose logs worker
docker compose exec postgres psql
```

## Milestone 8: Fake Deployment Workflow

**Label:** Core logic

Invariant / property to preserve:

- Every user-triggered deployment must have a durable PostgreSQL record before worker execution begins.

Build:

- Add backend endpoint to create a deployment.
- Store status in PostgreSQL.
- Queue job in Redis.
- Worker moves deployment through:
  - queued
  - building_image
  - starting_container
  - health_checking
  - running
- Worker writes deployment logs to PostgreSQL.

Review deeply:

- Difference between container logs and deployment/domain logs.
- Why application logs are stored by deployment id.
- How Redis loss can be recovered from PostgreSQL pending records.

Verify:

```bash
docker compose logs backend
docker compose logs worker
```

## Milestone 9: Dashboard Data Views

**Label:** Supporting/boilerplate

Build:

- Show deployments list.
- Show deployment detail timeline.
- Show limited platform service status:
  - backend health
  - PostgreSQL reachability
  - Redis reachability
  - worker heartbeat freshness
  - frontend loaded state
- Show Docker command hints.

Review:

- Confirm the dashboard does not fake Docker Engine status.
- Confirm command hints are accurate and useful.

## Milestone 10: Dev Compose Override And Bind Mounts

**Label:** Core logic

Invariant / property to preserve:

- Dev mode may mount source code, but runtime-like mode must run from built image contents.

Build:

- Add `compose.dev.yaml`.
- Bind mount:
  - `./backend -> /app`
  - `./frontend -> /app`
- Add named volumes for:
  - backend `node_modules`
  - frontend `node_modules`
- Publish PostgreSQL only in dev override.

Review deeply:

- Why bind mounts hide image contents at the mounted path.
- Why `node_modules` should live in a Docker named volume during dev.
- Difference between dev convenience and runtime image behavior.

Verify:

```bash
docker compose -f compose.yaml -f compose.dev.yaml config
docker compose -f compose.yaml -f compose.dev.yaml up
```

## Milestone 11: Multi-Stage Backend Dockerfile

**Label:** Core logic

Invariant / property to preserve:

- API and worker images must be built from explicit targets with no accidental secrets or host dependency leakage.

Build:

- Add backend multi-stage Dockerfile.
- Use Debian slim Node base.
- Create shared dependency/setup stage.
- Create final `api` target.
- Create final `worker` target.
- Run as non-root where practical.

Review deeply:

- What happens at build-time.
- What happens at run-time.
- Why one Dockerfile can produce separate API and worker images.
- How build cache changes when dependency files change.

Verify:

```bash
docker build --target api -t dockyard-api:dev ./backend
docker build --target worker -t dockyard-worker:dev ./backend
docker images
docker history dockyard-api:dev
```

## Milestone 12: Multi-Stage Frontend Dockerfile

**Label:** Core logic

Invariant / property to preserve:

- Runtime frontend image must contain built static assets, not the full development toolchain or local secrets.

Build:

- Add frontend multi-stage Dockerfile.
- Use Node builder stage.
- Use `nginx:alpine` runtime stage.
- Serve built Vite assets.
- Run as non-root where practical.

Review deeply:

- Difference between frontend dev server and Nginx static runtime.
- Why builder dependencies should not ship in runtime image.
  - Install dependencies in container itself directly: 
    + Root priviledge is needed to install dependencies, but we just use root in build time, should not in run time.
    + So slow.
  - Bind mount dependencies from volume into container:
    + Because by convention / practical, image contains everything it need to run. Now frontend runtime image no need it, it just need 
    Nginx -- built static files from dist/.
- Why `EXPOSE` documents a port but does not publish it by itself.

Verify:

```bash
docker build -t dockyard-frontend:dev ./frontend
docker images
docker history dockyard-frontend:dev
```

## Milestone 13: Health Checks And Readiness

**Label:** Core logic

Invariant / property to preserve:

- Only report a service as healthy when it can actually do its required job.

Build:

- Add PostgreSQL health check.
- Add Redis health check.
- Upgrade backend `/health` to check PostgreSQL and Redis.
- Add Compose dependency ordering based on infra health.
- Add app-level retry in backend and worker.

Review deeply:

- Difference between started, healthy, unhealthy, and exited.
- Why Compose startup ordering is not enough by itself.
- Why backend health should fail if PostgreSQL or Redis is unreachable.

Verify:

```bash
docker compose ps
docker inspect
docker compose logs backend
```

## Milestone 14: Resource Limits

**Label:** Core logic

Invariant / property to preserve:

- Every service must have explicit CPU and memory boundaries so resource usage is observable and bounded.

Build:

- Add reasonable CPU/RAM limits for all services.
- Document the chosen limits near the Compose config.
- Add a small worker stress/debug mode if useful.

Review deeply:

- What memory limit means for PostgreSQL, Redis, backend, frontend, and worker.
- Why Redis is memory-sensitive.
- How to observe usage versus limits.

Verify:

```bash
docker stats
docker inspect
```

## Milestone 15: Runtime-Like Compose Mode

**Label:** Core logic

Invariant / property to preserve:

- Runtime-like mode must not depend on host source files or dev-only bind mounts.

Build:

- Ensure `compose.yaml` can run built images without `compose.dev.yaml`.
- Keep PostgreSQL private in runtime-like mode.
- Keep backend published until Nginx milestone.

Review deeply:

- Difference between running from image contents and running from mounted source.
- Why runtime-like mode is closer to deployment behavior.

Verify:

```bash
docker compose build
docker compose up
docker compose ps
```

## Milestone 16: Debugging Exercises Pack 1

**Label:** Core logic

Invariant / property to preserve:

- Each failure must be controlled, explainable, and reversible without destroying unrelated project state.

Build:

- Document and practice:
  - wrong port mapping
  - wrong `DATABASE_URL` hostname
  - Redis restart losing jobs
  - worker heartbeat stale
  - PostgreSQL container deletion versus volume deletion

Review deeply:

- Which command reveals the failure?
- Which Docker concept caused the failure?
- What exact change fixes it?

Verify:

```bash
docker compose logs
docker compose ps
docker inspect
docker volume ls
```

## Milestone 17: Nginx Reverse Proxy

**Label:** Core logic

Invariant / property to preserve:

- Only the gateway should be publicly exposed after the proxy milestone; backend, PostgreSQL, Redis, and worker must remain private to Docker networks.

Build:

- Add `compose.proxy.yaml`.
- Add Nginx reverse proxy.
- Route:
  - `/` to frontend
  - `/api` to backend
- Remove backend host publishing in proxy mode.
- Add frontend and Nginx health checks.

Review deeply:

- Why Nginx can reach frontend and backend by service name.
- Why backend no longer needs `localhost:8080`.
- Difference between public and private networks.

Verify:

```bash
docker network ls
docker network inspect
docker compose -f compose.yaml -f compose.proxy.yaml ps
```

## Milestone 18: Public / Private Network Split

**Label:** Core logic

Invariant / property to preserve:

- Frontend/Nginx must not directly reach PostgreSQL or Redis after the network split.

Build:

- Split Compose networks into:
  - public network
  - private network
- Attach backend to both.
- Attach PostgreSQL, Redis, and worker to private network.
- Attach frontend and Nginx to public network.

Review deeply:

- Same-network service discovery.
- Why backend is attached to both networks.
- Why frontend should not directly reach database/cache services.

Verify:

```bash
docker network inspect
docker compose exec backend sh
```

## Milestone 19: Restart Policies

**Label:** Core logic

Invariant / property to preserve:

- Automatic restart behavior must not hide failures before they are observable in logs/status.

Build:

- Add restart policies after manual crash debugging is understood.
- Compare behavior before and after restart policies.

Review deeply:

- What Docker restarts automatically.
- Why restart policies react to exits, not necessarily unhealthy status.
- How logs still reveal crash loops.

Verify:

```bash
docker compose restart
docker compose stop
docker inspect
docker compose logs worker
```

## Milestone 20: Local Registry

**Label:** Core logic

Invariant / property to preserve:

- Image tags must identify the intended build artifact; pulling/running the wrong tag must be detectable.

Build:

- Add `compose.registry.yaml`.
- Run local `registry:2`.
- Tag a local image.
- Push to local registry.
- Pull/run the image locally.

Review deeply:

- Registry versus Git repository.
- Image tags and deployment-specific tags.
- Push/pull workflow.

Verify:

```bash
docker tag
docker push
docker pull
docker images
```

## Milestone 21: Database Migrations

**Label:** Core logic

Invariant / property to preserve:

- Existing PostgreSQL volume data must be upgraded without requiring destructive volume deletion.

Build:

- Add migration tooling once init SQL becomes limiting.
- Add one schema change through migration.
- Keep init SQL for fresh local databases.

Review deeply:

- Why editing init SQL does not update existing volumes.
- How schema changes relate to persistent Docker volumes.
- Why migrations matter after data exists.

Verify:

```bash
docker compose exec backend npm run migrate
docker compose logs backend
docker compose exec postgres psql
```

## Milestone 22: Debugging Lab

**Label:** Core logic

Invariant / property to preserve:

- Debugging scenarios must never require Docker socket access or uncontrolled host-level permissions.

Build:

- Combine several controlled failures:
  - broken Nginx `/api` route
  - stale worker heartbeat
  - unhealthy backend dependency check
  - wrong image tag
  - oversized build context
- Document diagnosis steps and fixes.

Review deeply:

- How to choose the right Docker command for the symptom.
- How to distinguish app bugs from Docker configuration bugs.
- How to recover without deleting durable state by accident.

Verify:

```bash
docker compose ps
docker compose logs
docker inspect
docker network inspect
docker volume inspect
docker stats
```
