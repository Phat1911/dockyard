# AGENTS.md

## Suppose i don't know anything about docker, so when touch to any concept about docker (like container, mount, ...), please slow down.
## Always answer me by english no worry what language i use to ask u.  

## Project Structure

- `SPEC.md`: public project specification and source of truth.
- `LEARNING_NOTES.md`: private beginner Docker notes; keep ignored by git.
- `frontend/`: React + Vite dashboard.
- `backend/`: Node.js + Fastify API, worker role, shared code, and database init/migration files.
- `compose.yaml`: shared Docker Compose base.
- `compose.dev.yaml`: dev bind mounts, dev commands, dev-only ports.
- `compose.proxy.yaml`: later Nginx reverse proxy milestone.
- `compose.registry.yaml`: later local registry milestone.

## Coding And Testing Conventions

- In your implementation, don't forget to mark (comment) what is milestone this code relate.
- Alway update DockerfileCMD.md and COMMANDS.md file if there are new dockerfile/docker command used in your implementation but is still not update on those two files yet.
- Keep app code simple; Docker learning is the main goal.
- Prefer Fastify for the backend API unless there is a clear reason to switch.
- Backend and worker share one backend Dockerfile with separate `api` and `worker` targets.
- Use multi-stage Dockerfiles from the beginning.
- Use strict `.dockerignore` files for every Docker build context.
- Store durable deployment data and domain logs in PostgreSQL.
- Treat Redis as temporary queue/cache state.
- Write service logs to stdout/stderr so `docker compose logs` is useful.
- Add focused tests as implementation grows; prioritize health checks, queue behavior, persistence, and recovery paths. (if needed)
- Verify Docker changes with relevant Compose commands, not only local unit tests.

## Rules

- Explain Docker concepts slowly and from first principles; assume the learner is new to Docker.
- Always answer in English, no matter what language the user uses.
- Do not implement Docker Engine socket access or real container control from the dashboard.
- Do not add Kubernetes, Docker Swarm, Terraform, service meshes, or cloud orchestration.
- Do not bake secrets into Docker images; use `.env` and `.env.example` for early local config.
- Keep `.env` and `LEARNING_NOTES.md` out of git.
- Start with one Compose network; split public/private networks only in the Nginx milestone.
- Publish frontend and backend early; unpublish backend after the Nginx reverse proxy milestone.
- Publish PostgreSQL only in dev override; keep Redis private; worker exposes no port.
- Use PostgreSQL named volumes for durable data; do not persist Redis initially.
- Use bind mounts for source code only in dev mode, plus named volumes for `node_modules`.
- Runtime-like mode must run from built images with no source bind mounts.
- Keep dashboard service status honest; do not fake Docker Engine inspection.
- Include deliberate debugging exercises for major Docker milestones.
