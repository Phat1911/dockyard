# Milestone 3: frontend image for the base Compose skeleton.
# This is multi-stage even while the app is tiny.

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY vite.config.js ./
COPY index.html ./
COPY src ./src
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
