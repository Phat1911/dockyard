# Milestone 12: build the Vite app in Node, then ship only static assets in Nginx.

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
# Milestone 12: dependency install stays in the builder stage, not the runtime image.
RUN npm ci
COPY vite.config.js ./
COPY index.html ./
COPY src ./src
# Milestone 17: proxy mode can build the frontend to call /api through Nginx.
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine AS runtime
# Milestone 12: Nginx serves only the compiled frontend output.
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Milestone 12: allow Nginx to run without root by using an unprivileged port.
RUN touch /var/run/nginx.pid \
  && chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
