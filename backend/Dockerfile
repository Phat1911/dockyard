# Milestone 11: backend/worker images share setup, then split into api and worker targets.
# One Dockerfile can build two explicit targets: api and worker.

FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
# Milestone 11: package files are copied before src so source edits do not reinstall dependencies.
RUN npm ci --omit=dev

FROM node:22-slim AS runtime-base
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
# Milestone 11: the running API/worker process does not need root privileges.
USER node

FROM runtime-base AS api
EXPOSE 8080
CMD ["npm", "start"]

FROM runtime-base AS worker
CMD ["npm", "run", "worker"]
