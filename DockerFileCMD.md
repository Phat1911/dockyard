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
COPY --from=deps /app/node_modules ./node_modules
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

Special multi-stage example:

```dockerfile
COPY --from=deps /app/node_modules ./node_modules
```

means:

```text
copy node_modules from the deps build stage
into the current stage
```

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

## USER

```dockerfile
USER node
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

Compose publishes ports with:

```yaml
ports:
  - "8080:8080"
  - "3000:80"
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
