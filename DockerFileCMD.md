# Dockerfile Commands Used So Far

This file explains the Dockerfile instructions used in Dockyard up to now.

## FROM

```dockerfile
FROM node:22-slim AS deps
FROM nginx:alpine AS runtime
```

`FROM` chooses the base image.

Simple meaning:

```text
Start this image from an existing image.
```

Example:

```text
node:22-slim already has Node.js installed.
nginx:alpine already has Nginx installed.
```

`AS deps`, `AS api`, `AS worker`, and `AS runtime` name build stages.

That is what makes the Dockerfile multi-stage.

Milestone 12 frontend example:

```dockerfile
FROM node:22-slim AS builder
FROM nginx:alpine AS runtime
```

Simple meaning:

```text
Build the frontend with Node,
then run the frontend with Nginx.
```

## WORKDIR

```dockerfile
WORKDIR /app
```

`WORKDIR` sets the current folder inside the image.

After this line, commands run from:

```text
/app
```

So this:

```dockerfile
COPY package*.json ./
```

copies files into:

```text
/app
```

## COPY

```dockerfile
COPY package*.json ./
COPY src ./src
COPY db/migrations ./db/migrations
COPY --from=deps /app/node_modules ./node_modules
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

`COPY` puts files into the image at build-time.

Simple meaning:

```text
take files from the build context
put them inside the image
```

Example:

```dockerfile
COPY src ./src
```

means:

```text
copy local src folder into /app/src inside the image
```

Milestone 21 backend migration example:

```dockerfile
COPY db/migrations ./db/migrations
```

means:

```text
copy local migration SQL files into /app/db/migrations inside the image
```

That lets `docker compose exec backend npm run migrate` work from the backend container in runtime-like mode, where the backend does not use a source-code bind mount.

Special multi-stage example:

```dockerfile
COPY --from=deps /app/node_modules ./node_modules
```

means:

```text
copy node_modules from the deps build stage
into the current stage
```

Frontend runtime example:

```dockerfile
COPY --from=builder /app/dist /usr/share/nginx/html
```

Simple meaning:

```text
copy only the built frontend files from the builder stage
into the Nginx folder that serves web pages
```

Milestone 12 also copies:

```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

That gives Nginx a small Dockyard-specific config, including the container port it listens on.

## RUN

```dockerfile
RUN npm install --omit=dev
RUN npm ci --omit=dev
RUN npm install
RUN npm run build
```

`RUN` executes a command at build-time.

Build-time means:

```text
while Docker is building the image
```

Backend example:

```dockerfile
RUN npm ci --omit=dev
```

installs only production Node.js dependencies.

In the backend Dockerfile, milestone 11 uses:

```dockerfile
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
```

Simple meaning:

```text
copy the dependency list first,
install dependencies from the lockfile,
then copy the application source code.
```

This helps Docker reuse the dependency layer when only files in `src/` change.

Frontend example:

```dockerfile
RUN npm run build
```

builds the Vite frontend into static files.

Those results become part of the image layer.

## ENV

```dockerfile
ENV NODE_ENV=production
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
```

`ENV` sets an environment variable inside the image/container.

Simple meaning:

```text
set a default config value available when the container runs
```

Here:

```text
NODE_ENV=production
```

tells Node.js libraries that this image is for production-style runtime.

Important rule:

```text
Do not put secrets in ENV inside a Dockerfile.
```

Secrets should come from run-time config, like Compose `.env`.

## ARG

```dockerfile
ARG VITE_API_BASE_URL=http://localhost:8080
```

`ARG` defines a build-time variable.

Build-time means:

```text
while Docker is building the image
```

Milestone 17 uses this for the frontend because Vite bakes frontend environment values into the compiled browser files during `npm run build`.

Simple meaning:

```text
normal frontend build -> call http://localhost:8080
proxy frontend build  -> call /api
```

Proxy mode tags that image separately as:

```text
dockyard-frontend-proxy:dev
```

That avoids mixing the normal frontend image with the proxy frontend image.

Compose passes the proxy value like this:

```yaml
args:
  VITE_API_BASE_URL: /api
```

Important:

```text
Do not use ARG for secrets.
Build arguments can become visible in image build history or compiled output.
```

## USER

```dockerfile
USER node
USER nginx
```

`USER` chooses which Linux user runs later commands and the final container process.

Simple meaning:

```text
run the app as node instead of root
```

Why this matters:

```text
root has more power inside the container.
node is less powerful and safer for app runtime.
```

For the frontend runtime:

```text
nginx is less powerful than root and is enough to serve static files
```

## EXPOSE

```dockerfile
EXPOSE 8080
EXPOSE 80
```

`EXPOSE` documents the port the app listens on inside the container.

Important:

```text
EXPOSE does not publish the port to your laptop.
```

This only says:

```text
backend listens on container port 8080
frontend Nginx listens on container port 80
```

Milestone 12 changes the frontend runtime to:

```dockerfile
EXPOSE 8080
```

Simple meaning:

```text
frontend Nginx listens on container port 8080
```

This makes non-root Nginx practical. On Linux, low ports like `80` usually require extra privileges. Port `8080` avoids that.

Compose publishes ports with:

```yaml
ports:
  - "8080:8080"
  - "3000:8080"
```

## CMD

```dockerfile
CMD ["npm", "start"]
CMD ["npm", "run", "worker"]
CMD ["nginx", "-g", "daemon off;"]
```

`CMD` defines the default command when a container starts from the image.

Run-time means:

```text
when Docker starts a container from the image
```

Backend API:

```dockerfile
CMD ["npm", "start"]
```

starts the API server.

Worker:

```dockerfile
CMD ["npm", "run", "worker"]
```

starts the background worker process.

Frontend:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

starts Nginx and keeps it running in the foreground.

## Build-Time vs Run-Time

Build-time Dockerfile instructions used here:

```text
FROM
WORKDIR
COPY
RUN
ARG
ENV
USER
EXPOSE
CMD
```

Most Dockerfile instructions are processed while building the image.

But `CMD` is special:

```text
CMD is written into the image at build-time,
then executed later at run-time when a container starts.
```

## Current Dockyard Dockerfiles

Backend:

```text
backend/Dockerfile
```

Build targets:

```text
api
worker
```

Milestone 11 can build each target directly:

```powershell
docker build --target api -t dockyard-api:dev ./backend
docker build --target worker -t dockyard-worker:dev ./backend
```

`--target` is a `docker build` option, not a Dockerfile instruction.

Simple meaning:

```text
Build the Dockerfile only up to the named stage.
```

Frontend:

```text
frontend/Dockerfile
```

Build stages:

```text
builder
runtime
```

Milestone 12 invariant:

```text
The runtime frontend image contains built static assets,
not the full development toolchain or local secrets.
```

The builder stage can use Node, npm, Vite, source files, and dependencies.
The runtime stage should serve the compiled `dist` output with Nginx.
