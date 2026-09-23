<div align="center">

[![License][badge-license]][link-license]

<br/>

### TSC Printer Server

Cross-platform HTTP server for TSC label printers — raw TSPL over TCP, no native DLL

<br/>

[![Node.js][badge-nodejs]][link-nodejs]
[![Express][badge-express]][link-express]
[![TypeScript][badge-typescript]][link-typescript]
[![React][badge-react]][link-react]
[![SQLite][badge-sqlite]][link-sqlite]
[![Vitest][badge-vitest]][link-vitest]

</div>

## Quick Start

Check out the [Getting Started](#getting-started) section for full instructions.

1. `npm install && npm run frontend:install`
2. `cp .env.example .env`
3. `npm run build:all`
4. `npm start`

<br/>

> [!NOTE]
> TSC Printer Server talks to TSC label printers using raw **TSPL over TCP (port 9100)** — there is no native DLL and no `edge-js`, so it runs the same on Linux, Windows, and ARM (Raspberry Pi, Apple Silicon, containers). It ships with a typed TSPL builder, stored editable templates, an HTTP API, a React frontend, and a dry-run mode so you can test with no printer.

## Features

- **TSPL Command Builder** — Typed builder for text, barcodes, and raw commands, with escaping that is safe against command injection
- **Stored, Editable Templates** — Raw TSPL with `{{placeholders}}` saved in SQLite, printed by name with your data; author them in the browser or over the API. All templated printing goes through these — there are no hardcoded templates
- **HTTP API** — Print from a stored template, a built-in test label, a custom label, or raw TSPL
- **React Frontend** — Vite + TypeScript UI to author templates, fill and print them, and preview the label live
- **Dry-Run Mode** — Returns the generated TSPL (downloaded by the UI) so you can test with no hardware
- **SQLite-Backed Settings & Templates** — Printer/label configuration and label templates are stored in a database and editable at runtime; only `PORT`/`HOST` stay in `.env`
- **Docker Support** — Three-stage Alpine-based image (~189 MB) for amd64 and arm64

## Links

- [Getting Started](#getting-started)
- [Docker](#docker)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Coordinates and Orientation](#coordinates-and-orientation)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Architecture

```
                    React app (frontend/, Vite + TS)
                 built to public/ and served by Express
                                  │  HTTP + JSON
                                  ▼
        ┌───────────────────────────────────────────────┐
        │                 HTTP layer (src/http)           │
        │  app.ts      Express factory + error middleware │
        │  routes/*    per-resource route modules         │
        │  schemas.ts  zod request validation             │
        │  errors.ts   domain error → HTTP status mapping │
        └───────────────────────────────────────────────┘
                                  │  validated request
                                  ▼
        ┌───────────────────────────────────────────────┐
        │           Templates (src/templates)             │
        │  string-template.ts  schemas, validation, and   │
        │  {{placeholder}} render engine (→ raw TSPL)      │
        └───────────────────────────────────────────────┘
                                  │  rendered TSPL
                                  ▼
        ┌───────────────────────────────────────────────┐
        │              Service layer (src/printer)        │
        │  service.ts  reads settings, builds TSPL, sends │
        └───────────────────────────────────────────────┘
              │                 │                     │
              ▼                 ▼                     ▼
   ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
   │ TSPL (src/tspl)│  │ DB (src/db)       │  │ Transport (src/printer)│
   │ types.ts       │  │ database.ts (+mig)│  │ NetworkTransport (TCP) │
   │ builder.ts     │  │ settingsRepo.ts   │  │ DryRunTransport        │
   │ (validateSpec) │  │ settings.ts (zod) │  │ PrinterError           │
   └────────────────┘  └──────────────────┘  └────────────────────────┘
                              │                          │
                              ▼                          ▼
                     SQLite (DB_PATH)     TSC printer (TCP :9100) or TSPL to client
```

**Key design decisions:**

- **Transport is an interface** (`PrinterTransport`) — tests inject a fake transport, so the API is exercised end-to-end without touching a printer
- **Printing is template-driven** — templates are raw TSPL with `{{placeholders}}` stored in SQLite; on save they are validated (structural TSPL rules + placeholder/variable audit) and on print every value is escaped so caller data can't break out of a quoted argument or inject commands
- **Settings live in SQLite**, not the environment — validated on every read/write with zod, applied transactionally, and read live so changes take effect without a restart
- **Only `PORT`/`HOST` come from `.env`** (`config.ts` with zod) — invalid values fail fast at startup with a readable message
- **The app factory is separate from server start** (`createApp` vs `index.ts`) so `supertest` can mount the app in-process
- **ESM throughout**, targeting modern Node, with no runtime transpilation quirks

### Request flow (example: `POST /api/db-templates/:name/print`)

1. A client sends `POST /api/db-templates/:name/print` with `{ "data": {...} }`.
2. `routes.ts` validates the envelope (`schemas.ts`), then loads the named template from SQLite (404 if unknown) and renders it: each `{{placeholder}}` is substituted with the supplied value, every value is escaped, and required-variable presence is enforced (400 `MissingVariables` otherwise).
3. The rendered TSPL is normalised to CRLF line endings (required by TSPL).
4. The service hands the TSPL to the configured **transport**: `NetworkTransport` opens a TCP socket to the printer and writes the bytes, while `DryRunTransport` returns the TSPL without touching hardware (the web UI downloads it as a `.prn` file).
5. The response returns `{ ok, template, result, tspl }` — including the exact TSPL sent, handy for debugging and previewing.

## Getting Started

### Prerequisites

- **Node.js** 18+ (developed and verified on Node 22)
- A **TSC printer** reachable over the network — or use **dry-run mode** for no hardware

### Install

```bash
# Install server dependencies
npm install

# Install the React app's dependencies
npm run frontend:install

# Copy the environment file (PowerShell: Copy-Item .env.example .env)
cp .env.example .env
```

### Build

```bash
# Build the React app into public/
npm run frontend:build

# Compile the server into dist/
npm run build

# Or build both in one command
npm run build:all
```

### Run

```bash
npm start
```

The server starts on port 8080 (or the `PORT` in your `.env`). Open `http://localhost:8080` for the web UI.

On first run the server creates `./data/settings.db` and seeds default settings, including `dryRun = true` — so nothing needs a printer. In dry-run the generated TSPL is returned in the API response and the web UI downloads it as a `.prn` file. To print for real, turn off dry-run and set the printer IP via the settings API (or the web UI):

```bash
curl -X PUT http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"printer":{"dryRun":false,"ip":"192.168.0.50"}}'
```

### Development

```bash
# Start the API in watch mode (hot-reload via tsx)
npm run dev

# Start the web UI dev server (HMR via Vite on :5173)
npm run frontend:dev

# Type-check without emitting files
npm run typecheck

# Lint src and tests with ESLint
npm run lint

# Run all tests
npm test
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to the API server, so both hot-reload independently.

## Docker

Build and run as a container (includes API and web UI). Mount a volume for `/app/data` so the settings database survives restarts:

```bash
# Build the image
docker build -t tsc-printer-server .

# Run with default settings
docker run --rm -p 8080:8080 -v tsc_data:/app/data tsc-printer-server
```

Then configure the printer at runtime via the settings API:

```bash
curl -X PUT http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"printer":{"dryRun":false,"ip":"192.168.0.50"}}'
```

For multi-platform builds (amd64 + arm64):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t tsc-printer-server .
```

The image is a three-stage build on `node:22-alpine` (Node 22 satisfies `better-sqlite3@13`'s `engines: node >=22`):

- **`deps`** installs production dependencies only, including the native `better-sqlite3` binary, then trims its compile-time sources and the prebuilt binaries for platforms other than Alpine (musl).
- **`build`** compiles the server TypeScript **and** builds the React frontend into `public/`.
- **`runtime`** copies just the trimmed `node_modules`, `dist/`, and `public/`. It ships **no build tools**, runs as the non-root `node` user, declares a `data` volume, and includes a `HEALTHCHECK` that polls `/api/health` (using Node's `fetch`, so no `curl`/`wget` is added). It binds to `0.0.0.0` so the port maps correctly. Final size is ~189 MB.

### Building Behind a TLS-Inspection Proxy

Compiling/fetching the `better-sqlite3` native binary reaches out to `nodejs.org` / `github.com` over HTTPS. If your network re-signs TLS traffic (e.g., Zscaler), those requests fail certificate verification. To fix it **without disabling TLS verification**:

1. Export your proxy's root CA (PEM) and drop it into `certs/` as a `.crt` file (the folder is kept via `certs/.gitkeep`; real certs are gitignored).

2. Build normally — the builder stages install that CA into their trust store and expose it to Node via `NODE_EXTRA_CA_CERTS`. The CA is **never** included in the runtime image.

> [!NOTE]
> For registry pulls behind the same proxy, point BuildKit at the CA with a `buildkitd.toml` (`[registry."docker.io"] ca=[...]`) when creating your builder.

## Configuration

Configuration is split in two:

- **Environment (`.env`)** — only how the HTTP server binds.
- **Settings (SQLite)** — printer connection and label defaults, editable at runtime through the [settings API](#settings).

### Environment Variables

See [`.env.example`](./.env.example). Invalid values (e.g. a non-numeric `PORT`) cause the server to exit at startup with a description of what failed.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces, needed in Docker) |
| `DB_PATH` | `./data/settings.db` | SQLite database file path (schema migrations run automatically on open) |

### Settings (SQLite)

Stored in `./data/settings.db` (created and seeded on first run). Read with `GET /api/settings`; change with `PUT /api/settings` (partial updates are merged and validated). Every value is validated on read and write, so a corrupted or hand-edited database surfaces a clear error rather than misbehaving.

| Setting | Default | Description |
|---------|---------|-------------|
| `printer.ip` | `192.168.0.50` | Printer IP address |
| `printer.port` | `9100` | Raw TSPL port (standard for TSC network printers) |
| `printer.timeoutMs` | `5000` | Socket connect/write timeout |
| `printer.lingerMs` | `500` | Milliseconds to hold the socket open after flushing a job, so the printer commits the buffer before close |
| `printer.dryRun` | `true` | `true` returns TSPL to the client (downloaded by the UI) instead of sending to a printer |
| `label.widthMm` | `45` | Default label width (mm) |
| `label.heightMm` | `75` | Default label height (mm) |
| `label.gapMm` | `3` | Gap between labels (mm) |
| `label.direction` | `0` | `0` normal, `1` flipped 180° |
| `label.mirror` | `0` | `0` normal, `1` mirrored |
| `label.dpmm` | `8` | Dots per mm: `8` = 203 dpi, `11.8` = 300 dpi, `24` = 600 dpi |

To reset all settings to defaults, stop the server and delete `./data/settings.db`; it will be recreated on the next start.

## API Reference

Base path: `/api`. All print endpoints return `{ ok, result, tspl }`, where `tspl` is the exact program sent to the printer and `result` reports the mode (`network` or `dry-run`) and bytes sent.

### Health & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness check — returns `{ "status": "ok", "dryRun": <bool> }` |
| GET | `/api/config` | Compact view of current settings |
| GET | `/api/settings` | Full current settings object |
| PUT | `/api/settings` | Partial update — merged, validated, persisted; returns `{ ok, settings }` |

`GET /api/settings` returns:

```json
{
  "printer": { "ip": "192.168.0.50", "port": 9100, "timeoutMs": 5000, "lingerMs": 500, "dryRun": true },
  "label": { "widthMm": 45, "heightMm": 75, "gapMm": 3, "direction": 0, "mirror": 0, "dpmm": 8 }
}
```

### Stored Templates (`/api/db-templates`)

User-editable templates stored in SQLite. A template is **raw TSPL with `{{placeholders}}`** plus a **variable manifest** (name, required, sample). This is the path used by the web UI's template editor — the most flexible way to author labels, editing the TSPL directly with no code changes.

On save, a template is validated: it must contain `SIZE` and `PRINT`, use a `GAP`/`BLINE`, and every `{{placeholder}}` must be a declared variable (and vice versa). At print/preview time, every supplied value is escaped so caller data can never break out of a quoted argument or inject extra commands, and the output is normalised to CRLF line endings (required by TSPL).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/db-templates` | List all templates (name, description, source, variables, geometry) |
| GET | `/api/db-templates/:name` | Get one template |
| POST | `/api/db-templates` | Create a template |
| PUT | `/api/db-templates/:name` | Update a template |
| DELETE | `/api/db-templates/:name` | Delete a template |
| POST | `/api/db-templates/:name/preview` | Render to TSPL **without** printing |
| POST | `/api/db-templates/:name/print` | Render and send to the printer |

A ready-to-use template, `tad-inspecao-defect-taxa`, is seeded on first run. Print it by passing a value for each declared variable:

```bash
curl -X POST http://localhost:8080/api/db-templates/tad-inspecao-defect-taxa/print \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "qrData": "SAMPLE-001",
      "id": "SAMPLE-001",
      "timestamp": "11/09/2026 10:15:32",
      "footer": "SAMPLE REPORT",
      "m0_label": "M0", "m0_value": "84", "m0_ci": "78-88",
      "m1_label": "M1", "m1_value": "62", "m1_ci": "55-70",
      "m2_label": "M2", "m2_value": "93", "m2_ci": "85-95",
      "m3_label": "M3", "m3_value": "45", "m3_ci": "40-55",
      "m4_label": "M4", "m4_value": "78", "m4_ci": "70-85",
      "m5_label": "M5", "m5_value": "12.3","m5_ci": "10-15"
    }
  }'
```

PowerShell:

```powershell
$body = @{
  data = @{
    qrData = 'SAMPLE-001'; id = 'SAMPLE-001'; timestamp = '11/09/2026 10:15:32'
    footer = 'SAMPLE REPORT'
    m0_label = 'M0'; m0_value = '84';  m0_ci = '78-88'
    m1_label = 'M1'; m1_value = '62';  m1_ci = '55-70'
    m2_label = 'M2'; m2_value = '93';  m2_ci = '85-95'
    m3_label = 'M3'; m3_value = '45';  m3_ci = '40-55'
    m4_label = 'M4'; m4_value = '78';  m4_ci = '70-85'
    m5_label = 'M5'; m5_value = '12.3';m5_ci = '10-15'
  }
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/db-templates/tad-inspecao-defect-taxa/print `
  -Method POST -ContentType 'application/json' -Body $body
```

Create a template:

```bash
curl -X POST http://localhost:8080/api/db-templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hello",
    "description": "Minimal example",
    "source": "SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nDIRECTION 0,0\nCLS\nCODEPAGE UTF-8\nTEXT 20,20,\"3\",0,1,1,\"{{title}}\"\nPRINT 1,1",
    "variables": [ { "name": "title", "required": true, "sample": "Hello" } ],
    "geometry": { "widthMm": 45, "heightMm": 75, "dpmm": 8 }
  }'
```

Preview (no printing) returns `{ ok, name, tspl }`; print returns `{ ok, template, copies, result, tspl }`.

**Errors:**

- `404 TemplateNotFound` — no template with that name
- `409 TemplateExists` — creating a name that already exists
- `400 TemplateValidationError` — the TSPL/manifest is invalid (`issues[]` lists each problem, e.g. `missing-print`, `undeclared-variable`)
- `400 MissingVariables` — a required variable had no value (`missing[]` names them)

> All templated printing now goes through **stored DB templates**
> (`/api/db-templates/*`). The former code-defined templates (`defect-tag`,
> `simple-label`) are seeded as editable DB string templates
> (`tad-inspecao-defect-taxa`, `simple-label`) — there is no hardcoded template
> registry or `POST /api/print` endpoint.

### Low-Level Print Endpoints

For printing without a stored template — a built-in test label, a fully
specified label, or raw TSPL command lines.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/print/test` | Print the built-in demo label (`{ "landscape": true }`) |
| POST | `/api/print/label` | Print a fully specified label (geometry + elements) |
| POST | `/api/print/raw` | Send raw TSPL command lines verbatim |

`POST /api/print/label` accepts element kinds `text`, `barcode`, and `raw` (`{ "kind": "raw", "command": "DENSITY 8" }`):

```json
{
  "geometry": { "widthMm": 45, "heightMm": 75, "gapMm": 3, "direction": 0, "mirror": 0 },
  "elements": [
    { "kind": "text", "x": 60, "y": 30, "font": "3", "rotation": 90, "xMultiplier": 1, "yMultiplier": 1, "content": "Hello" },
    { "kind": "barcode", "x": 180, "y": 30, "type": "128", "height": 70, "readable": 0, "rotation": 90, "narrow": 3, "wide": 1, "content": "123456" }
  ],
  "quantity": 1,
  "copies": 1
}
```

`POST /api/print/raw`:

```json
{ "commands": ["SIZE 45 mm,75 mm", "GAP 3 mm,0 mm", "CLS", "PRINT 1,1"] }
```

**Error responses:**

- `400 ValidationError` — the request body failed schema validation (`issues` lists details)
- `400 SpecValidationError` — an element falls outside the label bounds for the current DPI (`issues` names each off-label element), caught before anything reaches the printer
- `404 NotFound` — unknown `/api/*` route
- `502 PrinterError` — the printer could not be reached (timeout, refused, etc.)

## Coordinates and Orientation

- Element `x`/`y` are in **dots** from the top-left origin. `203 dpi = 8 dots/mm`, `300 dpi ≈ 11.8 dots/mm`. Set `label.dpmm` to match your printhead.
- **Landscape**: TSC printers have no landscape switch. Content is rotated 90° per element. In the built-in test layout, `y` is the shared left margin and `x` steps down the label length so rows don't overlap.
- **Whole-label flip**: set `label.direction` to `1` if prints come out upside down.
- Keep elements inside the label: for a 45 mm-wide label at 203 dpi the x range is `0..360` dots; for 75 mm the y range is `0..600` dots.

## Project Structure

```
tsc-printer-server/
├── src/                      # Control API (TypeScript, ES modules)
│   ├── config.ts             # env loading + validation (PORT/HOST/DB_PATH)
│   ├── index.ts              # entry point (opens DB, starts server, graceful shutdown)
│   ├── db/                   # SQLite connection + migrations, settings + templates repos, seeds
│   ├── http/                 # Express app factory, per-resource routes, schemas, error mapping
│   ├── printer/              # service (reads settings, builds TSPL) + transports
│   ├── templates/            # string-template.ts: schemas, validation, {{placeholder}} render
│   └── tspl/                 # builder.ts (build/validate/escape + test label) + types.ts
├── frontend/                 # React app (Vite + TypeScript)
│   └── src/                  # App shell, typed API client, panels (settings, test, custom, raw)
├── public/                   # built React bundle (generated, gitignored)
├── tests/                    # vitest unit + API tests (server)
├── data/                     # SQLite database (created at runtime, gitignored)
├── certs/                    # optional proxy root CA for builds (gitignored, .gitkeep kept)
├── Dockerfile                # three-stage, multi-arch container build (node:22-alpine)
└── .env.example              # annotated environment template (PORT/HOST/DB_PATH)
```

## Tech Stack

- **Node.js 18+** + **Express 4** — HTTP server and API
- **TypeScript 5** — strict mode, ES modules
- **better-sqlite3** — embedded database for settings and templates
- **zod** — request and settings validation
- **React 18** + **Vite** — web UI and frontend build
- **Vitest** + **supertest** — testing (unit + API with injected fake transport)
- **Raw TSPL over TCP** — printer transport (no native DLL, no `edge-js`)
- **Docker** — three-stage Alpine build (amd64 + arm64)

## Testing

Tests use **vitest**. They cover TSPL rendering and spec validation, template
rendering/validation, config, the SQLite migrations and repositories (in-memory
DB), the transport, HTTP error mapping, and the HTTP API (via **supertest** with
an injected fake transport and an in-memory database, so no printer or on-disk
state is involved).

```bash
npm test          # run once
npm run test:watch
```

```
tests/
  builder.test.ts             TSPL rendering + string escaping (command-injection safe)
  builder-validate.test.ts    validateSpec bounds checking against label geometry
  layouts.test.ts             test-label geometry scaling + landscape rotation
  template-render.test.ts     {{placeholder}} render, escaping, required-var enforcement
  config.test.ts              PORT/HOST/DB_PATH parsing, defaults, validation errors
  database.test.ts            schema migrations (user_version), table creation, idempotency
  settings.test.ts            settings seed, partial update, validation, persistence
  templatesRepository.test.ts template CRUD, seeding, validation
  transport.test.ts           dry-run + network transport, failure paths, connection probe
  http-errors.test.ts         domain error → HTTP status mapping
  api.test.ts                 all endpoints (incl. settings), validation, error handling
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `502 PrinterError` / timeout | Wrong `printer.ip`, printer off, or not on the same network. Test with `ping <ip>`. |
| Prints come out upside down | Set `label.direction` to `1` via `PUT /api/settings`. |
| Content clipped off the edge | Coordinates exceed the label. Check `label.dpmm` matches your DPI (203 vs 300). |
| Barcode missing | Its `x`/`y` (plus rotated height) fall outside the printable area — pull it in. |
| Nothing prints but no error | `printer.dryRun` is `true` — the TSPL was downloaded as a `.prn` file instead of sent. Set it to `false`. |
| Settings look wrong / corrupted | Stop the server and delete `./data/settings.db`; defaults are reseeded on start. |
| Server exits at startup | `PORT`/`HOST`/`DB_PATH` is invalid; the error message names the offending variable. |

## Contributing

For the layered design and the patterns the codebase uses, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short imperative description
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`

## License

MIT

<!-- Badge images -->
[badge-license]: https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge&labelColor=ececec
[badge-nodejs]: https://img.shields.io/badge/Node.js-18+-339933.svg?style=for-the-badge&logo=node.js&logoColor=339933&labelColor=ececec
[badge-express]: https://img.shields.io/badge/Express-4-000000.svg?style=for-the-badge&logo=express&logoColor=000000&labelColor=ececec
[badge-typescript]: https://img.shields.io/badge/TypeScript-5-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=3178C6&labelColor=ececec
[badge-react]: https://img.shields.io/badge/React-18-61DAFB.svg?style=for-the-badge&logo=react&logoColor=61DAFB&labelColor=ececec
[badge-sqlite]: https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg?style=for-the-badge&logo=sqlite&logoColor=003B57&labelColor=ececec
[badge-vitest]: https://img.shields.io/badge/Vitest-tested-6E9F18.svg?style=for-the-badge&logo=vitest&logoColor=6E9F18&labelColor=ececec

<!-- Badge links -->
[link-license]: https://opensource.org/licenses/MIT
[link-nodejs]: https://nodejs.org/
[link-express]: https://expressjs.com/
[link-typescript]: https://www.typescriptlang.org/
[link-react]: https://react.dev/
[link-sqlite]: https://github.com/WiseLibs/better-sqlite3
[link-vitest]: https://vitest.dev/
