# Milestone 16: Debugging Exercises Pack 1

This guide is for controlled Docker debugging practice.

Controlled means:

```text
break one thing on purpose
observe the symptom
connect the symptom to one Docker concept
undo the break
verify the stack is healthy again
```

Run commands from the project root:

```powershell
cd D:\dockyard
```

Start from the normal runtime-like Compose stack:

```powershell
docker compose up -d --build
docker compose ps
```

In this milestone, do not edit `compose.yaml` unless an exercise explicitly tells you to inspect it. Most breaks use temporary PowerShell environment variables or safe container operations, so you can reverse them quickly.

## Beginner Docker Map

A few words used in these exercises:

```text
container = a running copy of an image
service = the Compose name for one kind of container, like backend or postgres
published port = a doorway from your laptop into a container
internal port = the port a process listens on inside Docker
volume = Docker-managed storage that can outlive a container
```

Important Dockyard examples:

```text
localhost:3000 -> frontend container port 8080
localhost:8080 -> backend container port 8080
backend -> talks to postgres by the service name postgres
worker -> talks to redis by the service name redis
PostgreSQL data -> stored in the postgres-data named volume
Redis queue data -> temporary and not persisted by Dockyard
```

## Exercise 1: Wrong Port Mapping

Milestone 16 failure:

```text
The backend is running, but you call the wrong host port from your laptop.
```

A port mapping has two sides:

```text
host port:container port
```

The host port is on your laptop. The container port is inside Docker.

Break it by temporarily publishing the backend on a different laptop port:

```powershell
$env:BACKEND_HOST_PORT="18080"
docker compose up -d --force-recreate backend frontend
docker compose ps
```

Now this old URL should fail because port `8080` is no longer the published backend doorway:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

This new URL should work:

```powershell
Invoke-RestMethod http://localhost:18080/health
```

Commands that reveal the failure:

```powershell
docker compose ps
docker compose logs --tail=20 backend
```

Concept causing the failure:

```text
Published ports are how your laptop reaches a container.
Changing the host side changes the localhost URL you must call.
```

Fix it:

```powershell
Remove-Item Env:BACKEND_HOST_PORT
docker compose up -d --force-recreate backend frontend
docker compose ps
Invoke-RestMethod http://localhost:8080/health
```

## Exercise 2: Wrong DATABASE_URL Hostname

Milestone 16 failure:

```text
The backend tries to connect to PostgreSQL through localhost from inside the backend container.
```

Inside a container, `localhost` means "this same container", not your laptop and not the PostgreSQL container.

Dockyard should use the Compose service name:

```text
postgres
```

Break it:

```powershell
$env:DATABASE_URL="postgres://dockyard:dockyard_dev_password@localhost:5432/dockyard"
docker compose up -d --force-recreate backend worker frontend
docker compose ps
```

Observe the backend health and logs:

```powershell
Invoke-RestMethod http://localhost:8080/health
docker compose logs --tail=40 backend
docker inspect dockyard-backend-1
```

In the `docker inspect` output, look for:

```text
State.Health.Status
State.Health.Log
```

Concept causing the failure:

```text
Containers on the same Compose network can reach each other by service name.
The backend container should connect to postgres:5432, not localhost:5432.
```

Fix it:

```powershell
Remove-Item Env:DATABASE_URL
docker compose up -d --force-recreate backend worker frontend
docker compose ps
Invoke-RestMethod http://localhost:8080/health
```

## Exercise 3: Redis Restart/Recreate Loses Queued Jobs

Milestone 16 failure:

```text
Redis loses temporary queued jobs when its container state is recreated.
PostgreSQL keeps the durable deployment record.
```

Redis is used like a temporary waiting line. PostgreSQL is used as the source of truth.

A plain `docker compose restart redis` stops and starts the same container. This exercise recreates the Redis container so the loss is clear and repeatable. That is the important Docker lesson for Dockyard: Redis has no named volume, so its queue state is not durable project data.

To make a queued job stay visible, stop the worker first:

```powershell
docker compose stop worker
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"name":"milestone 16 redis loss drill"}' http://localhost:8080/deployments
docker compose exec redis redis-cli LLEN dockyard:queue:deployments
```

You should see at least one queued Redis job.

Now recreate only Redis as a controlled restart-style failure:

```powershell
docker compose stop redis
docker compose rm -f redis
docker compose up -d redis
docker compose exec redis redis-cli LLEN dockyard:queue:deployments
```

The queue length should be `0` because Dockyard does not give Redis a volume.

Check that PostgreSQL still has the durable deployment row:

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status FROM deployments ORDER BY id DESC LIMIT 5;"
```

Concept causing the failure:

```text
Redis queue state is temporary in this project.
PostgreSQL data is durable because it lives in a named Docker volume.
```

Fix the stack:

```powershell
docker compose up -d redis backend worker frontend
docker compose ps
```

Practice recovery:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"name":"milestone 16 replacement deployment"}' http://localhost:8080/deployments
docker compose logs --tail=40 worker
```

At this milestone, recovery means you can prove the important record survived in PostgreSQL and then queue new work. A later milestone can add automatic re-enqueue behavior.

## Exercise 4: Stale Worker Heartbeat

Milestone 16 failure:

```text
The worker is not writing fresh heartbeat rows.
The backend reports that app-level worker liveness is stale.
```

A heartbeat is just a timestamp the worker writes into PostgreSQL to say, "I was alive at this time."

Break it by stopping the worker:

```powershell
docker compose stop worker
```

Wait longer than the stale threshold. The default threshold is 30 seconds:

```powershell
Start-Sleep -Seconds 35
Invoke-RestMethod http://localhost:8080/platform-services/worker
```

Also inspect the database row:

```powershell
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT worker_id, last_seen_at, note FROM worker_heartbeat;"
```

Commands that reveal the failure:

```powershell
docker compose ps
docker compose logs --tail=30 worker
Invoke-RestMethod http://localhost:8080/platform-services/worker
```

Concept causing the failure:

```text
Docker can tell you whether the worker container is running.
Dockyard's backend reports whether the worker application recently wrote a heartbeat.
Those are related, but not the same thing.
```

Fix it:

```powershell
docker compose up -d worker
Start-Sleep -Seconds 12
Invoke-RestMethod http://localhost:8080/platform-services/worker
docker compose logs --tail=20 worker
```

## Exercise 5: PostgreSQL Container Deletion Versus Volume Deletion

Milestone 16 failure:

```text
Deleting a PostgreSQL container is not the same as deleting the PostgreSQL volume.
```

A container is replaceable. A named volume is where Dockyard stores durable PostgreSQL data.

Create a deployment record:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"name":"milestone 16 postgres volume drill"}' http://localhost:8080/deployments
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status FROM deployments ORDER BY id DESC LIMIT 5;"
```

Delete only the PostgreSQL container:

```powershell
docker compose stop postgres
docker compose rm -f postgres
docker compose up -d postgres backend worker frontend
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status FROM deployments ORDER BY id DESC LIMIT 5;"
```

The data should still be there because `dockyard_postgres-data` still exists.

Commands that reveal the storage:

```powershell
docker volume ls
docker volume inspect dockyard_postgres-data
docker compose ps
```

Concept causing the behavior:

```text
The PostgreSQL container can be replaced.
The named volume stores the database files outside that container.
```

Danger zone: volume deletion

Do not run this during normal debugging:

```powershell
docker compose down -v
```

That command removes containers and Compose volumes. For Dockyard, that means the PostgreSQL named volume is deleted and durable local deployment data resets.

Only run it when you intentionally want a fresh local database:

```powershell
docker compose down -v
docker compose up -d --build
docker compose exec postgres psql -U dockyard -d dockyard -c "SELECT id, name, status FROM deployments ORDER BY id DESC LIMIT 5;"
```

After volume deletion, the table should exist again because init SQL runs on first startup, but old deployment rows should be gone.

## Final Healthy Check

After any exercise, return to the normal stack:

```powershell
Remove-Item Env:BACKEND_HOST_PORT -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:8080/health
Invoke-WebRequest -UseBasicParsing http://localhost:3000
Invoke-RestMethod http://localhost:8080/platform-services/worker
```

If something still looks wrong, use the general debugging commands:

```powershell
docker compose logs
docker inspect dockyard-backend-1
docker inspect dockyard-postgres-1
docker inspect dockyard-redis-1
docker volume ls
```
