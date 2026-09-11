# Multi-stage build. Runs on any platform Node supports (linux/amd64,
# linux/arm64, windows). Build with:  docker build -t tsc-printer-server .
FROM node:20-alpine AS build
WORKDIR /app

# Server dependencies + build.
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Frontend (React/Vite) dependencies + build. Emits into /app/public.
COPY frontend ./frontend
RUN npm --prefix frontend ci
RUN npm --prefix frontend run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 8080
# Bind to all interfaces inside the container.
ENV HOST=0.0.0.0
CMD ["node", "dist/index.js"]
