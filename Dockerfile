# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Multi-stage build producing a small Alpine runtime image.
#
# better-sqlite3 is a native addon. It resolves a prebuilt binary when one
# matches the platform, and otherwise compiles from source with node-gyp
# (needs a C/C++ toolchain + Python). Either path may reach out over HTTPS, so
# the toolchain and CA trust live only in the `deps`/`build` stages and never
# reach the final image. The runtime stage receives just the production
# node_modules (native binary included) plus the built server and frontend.
#
# Node 22 is required by better-sqlite3@13 (engines: node >=22).
#
# Build with:  docker build -t tsc-printer-server .
# ---------------------------------------------------------------------------

# NOTE ON TLS (build-time only): this project may be built behind a
# TLS-inspection proxy (e.g. Zscaler) that re-signs HTTPS traffic. building
# better-sqlite3 downloads Node headers from nodejs.org (node-gyp) and/or a
# prebuilt binary from github.com (prebuild-install), which fail certificate
# verification unless the proxy's root CA is trusted. The corporate root CA is
# vendored at certs/ and installed into the system trust store + exposed to
# Node via NODE_EXTRA_CA_CERTS in the builder stages ONLY. TLS verification is
# kept fully enabled. The runtime image ships no CA, no build tools, and makes
# no such outbound requests.

# --- Stage 1: production dependencies (with native addon compiled) ----------
FROM node:22-alpine AS deps
WORKDIR /app
# Toolchain to compile better-sqlite3 + corporate root CA for HTTPS trust.
COPY certs/ /usr/local/share/ca-certificates/
RUN apk add --no-cache python3 make g++ ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY package*.json ./
RUN npm ci --omit=dev
# Trim better-sqlite3 for a smaller runtime image:
#  - deps/ and src/ hold the bundled SQLite C sources, only needed to compile
#    from source (not used: a prebuilt binary is loaded at runtime).
#  - prebuilds/ ships binaries for 8 platforms; this Alpine (musl) image only
#    loads the linuxmusl-* variant, so the darwin/win32/glibc-linux binaries
#    are removed. musl arm64 is kept so the same layer works on arm64 Alpine.
# Together this saves ~24 MB.
RUN rm -rf node_modules/better-sqlite3/deps \
           node_modules/better-sqlite3/src && \
    find node_modules/better-sqlite3/prebuilds -type f -name '*.node' \
         ! -name 'linuxmusl-*.node' -delete

# --- Stage 2: build server (TypeScript) and frontend (Vite) -----------------
FROM node:22-alpine AS build
WORKDIR /app
COPY certs/ /usr/local/share/ca-certificates/
RUN apk add --no-cache python3 make g++ ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
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

# --- Stage 3: minimal runtime image -----------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# OCI image metadata.
LABEL org.opencontainers.image.title="tsc-printer-server" \
      org.opencontainers.image.description="Cross-platform TypeScript server for TSC label printers using raw TSPL over TCP." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

# Production dependencies with the already-compiled native addon.
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# Writable data directory for the SQLite database, owned by the node user.
RUN mkdir -p /app/data && chown -R node:node /app
# Persist the settings database across container restarts.
VOLUME ["/app/data"]
USER node

EXPOSE 8080

# Poll the app's health endpoint. Uses Node (already present) so no extra
# tooling like curl/wget is needed in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
