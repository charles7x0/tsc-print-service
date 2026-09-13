# TSC Printer Server

A cross-platform HTTP server for **TSC label printers**, written in TypeScript.
It talks to the printer using **raw TSPL over TCP (port 9100)** — there is **no
native DLL and no `edge-js`**, so it runs the same on **Linux, Windows, and ARM**
(Raspberry Pi, Apple Silicon, containers).

It ships with:

- A typed **TSPL command builder** (text, barcodes, raw commands).
- **Stored, editable templates**: raw TSPL with `{{placeholders}}` saved in the
  database, printed via the API by name with your data — create/edit them in the
  browser or over the API.
- An **HTTP API** to print from a template, a built-in test label, a custom
  label, or raw TSPL.
- A **React frontend** (Vite + TypeScript) to author templates, fill and print
  them, and preview the label live.
- A **dry-run mode** that returns the TSPL (downloaded by the UI) so you can test
  with **no printer**.
- **SQLite-backed settings and templates**: printer/label configuration and label
  templates are stored in a database and editable at runtime — only `PORT`/`HOST`
  stay in `.env`.

---

## Table of contents

- [Why no DLL?](#why-no-dll)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
  - [Environment (`.env`)](#environment-env)
  - [Settings (SQLite)](#settings-sqlite)
- [Commands](#commands)
- [HTTP API](#http-api)
- [Coordinates and orientation](#coordinates-and-orientation)
- [Testing](#testing)
- [Docker](#docker)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why no DLL?

The original TSC sample used `tsclibnet.dll` via `edge-js`. That approach is
Windows-only and breaks whenever the Node.js version changes (the `edge.node`
native binary must be pre-compiled for each Node release). TSC printers accept
plain **TSPL** over a TCP socket, so this project generates TSPL and sends it
directly. That removes every native dependency and makes the server portable
across operating systems and CPU architectures.

---

## Architecture

The server is organised in clear layers. Each layer depends only on the one
below it, and the printer connection is behind an interface so the whole stack
is testable without hardware.

```
                    React app (frontend/, Vite + TS)
                 built to public/ and served by Express
                                  │  HTTP + JSON
                                  ▼
        ┌───────────────────────────────────────────────┐
        │                 HTTP layer (src/http)           │
        │  app.ts     Express app factory + static files  │
        │  routes.ts  /api/* endpoints                     │
        │  schemas.ts zod request validation               │
        └───────────────────────────────────────────────┘
                                  │  validated request
                                  ▼
        ┌───────────────────────────────────────────────┐
        │           Templates (src/templates)             │
        │  registry.ts  name → { schema, render }         │
        │  defect-tag / simple-label  (data → LabelSpec)  │
        └───────────────────────────────────────────────┘
                                  │  LabelSpec
                                  ▼
        ┌───────────────────────────────────────────────┐
        │              Service layer (src/printer)        │
        │  service.ts  reads settings, builds TSPL, sends │
        └───────────────────────────────────────────────┘
              │                 │                     │
              ▼                 ▼                     ▼
   ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
   │ TSPL (src/tspl)│  │ DB (src/db)       │  │ Transport (src/printer)│
   │ types.ts       │  │ database.ts       │  │ NetworkTransport (TCP) │
   │ builder.ts     │  │ settingsRepo.ts   │  │ DryRunTransport        │
   │ layouts.ts     │  │ settings.ts (zod) │  └────────────────────────┘
   └────────────────┘  └──────────────────┘             │
                              │                          ▼
                              ▼        TSC printer (TCP :9100) or TSPL to client
                     SQLite (./data/settings.db)
```

### Request flow (example: `POST /api/print`)

1. A client sends `POST /api/print` with `{ "template": "defect-tag", "data": {...} }`.
2. `routes.ts` validates the envelope (`schemas.ts`), then asks the
   **template registry** to render: it looks up the template (404 if unknown),
   validates `data` against that template's own zod schema (400 with field
   issues if invalid), and calls its `render(data, { geometry, dpmm })`.
3. The template computes a `LabelSpec` from the label geometry/DPI (owned by
   settings, not the payload) — so it scales to any label size.
4. `builder.ts` turns the `LabelSpec` into a TSPL string; the service hands it
   to the configured **transport**:
   - `NetworkTransport` opens a TCP socket to the printer and writes the bytes.
   - `DryRunTransport` returns the TSPL without touching hardware; the web UI
     downloads it as a `.prn` file.
5. The response returns `{ ok, template, result, tspl }` — including the exact
   TSPL sent, handy for debugging and previewing.

### Design choices

- **Transport is an interface** (`PrinterTransport`). Tests inject a fake
  transport, so the API is exercised end-to-end without touching a printer.
- **Printing is template-driven**. Each template is a `TemplateDefinition` with
  a zod `dataSchema` and a `render(data, { geometry, dpmm }) → LabelSpec`.
  Callers send business data and a template name; the server owns layout,
  coordinate maths, and DPI scaling. Geometry comes from printer/label settings
  (not the payload), so the same request prints on any stock/printhead. New
  templates are added by creating a file under `src/templates/` and registering
  it in `createDefaultRegistry()`; no route changes needed.
- **Settings live in SQLite**, not the environment. The `SettingsRepository`
  seeds defaults on first run, validates every read/write with zod, and applies
  updates transactionally. Prints read settings live, so changes take effect
  without a restart. Tests use an in-memory database (`:memory:`).
- **Only `PORT`/`HOST` come from `.env`** (`config.ts` with zod). Invalid values
  fail fast at startup with a readable message.
- **The app factory is separate from server start** (`createApp` vs `index.ts`),
  so `supertest` can mount the app in-process for integration tests.
- **ESM throughout**, targeting modern Node. No transpilation quirks at runtime.

---

## Requirements

- Node.js **>= 18** (developed and verified on Node 22).
- A TSC printer reachable over the network — or use **dry-run mode** for no hardware.

---

## Getting started

Install and set up the environment:

```bash
npm install
npm run frontend:install          # installs the React app's dependencies
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
```

**Production-style (server serves the built React app):**

```bash
npm run frontend:build            # builds the React app into public/
npm run build                     # compiles the server into dist/
npm start                         # serves API + frontend on one port
```

Open <http://localhost:8080> (or the `PORT` in your `.env`).

**Development (two processes, with hot reload):**

```bash
npm run dev                       # terminal 1: API server (tsx watch)
npm run frontend:dev              # terminal 2: Vite dev server on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the API
server, so both hot-reload independently.

On first run the server creates `./data/settings.db` and seeds default settings,
including `dryRun = true` — so nothing needs a printer. In dry-run the generated
TSPL is returned in the API response and the web UI downloads it as a `.prn`
file (nothing is saved on the server). To print for real, turn off dry-run and
set the printer IP via the settings API (or the web UI):

```bash
curl -X PUT http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"printer":{"dryRun":false,"ip":"192.168.0.50"}}'
```

---

## Configuration

Configuration is split in two:

- **Environment (`.env`)** — only how the HTTP server binds.
- **Settings (SQLite)** — printer connection and label defaults, editable at
  runtime through the [settings API](#get-apisettings).

### Environment (`.env`)

See [`.env.example`](./.env.example).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces, needed in Docker) |

Invalid values (e.g. a non-numeric `PORT`) cause the server to exit at startup
with a description of what failed.

### Settings (SQLite)

Stored in `./data/settings.db` (created and seeded on first run). Read with
`GET /api/settings`; change with `PUT /api/settings` (partial updates are merged
and validated). Every value is validated on read and write, so a corrupted or
hand-edited database surfaces a clear error rather than misbehaving.

| Setting | Default | Description |
|---|---|---|
| `printer.ip` | `192.168.0.50` | Printer IP address |
| `printer.port` | `9100` | Raw TSPL port (standard for TSC network printers) |
| `printer.timeoutMs` | `5000` | Socket connect/write timeout |
| `printer.dryRun` | `true` | `true` returns TSPL to the client (downloaded by the UI) instead of sending to a printer |
| `label.widthMm` | `45` | Default label width (mm) |
| `label.heightMm` | `75` | Default label height (mm) |
| `label.gapMm` | `3` | Gap between labels (mm) |
| `label.direction` | `0` | `0` normal, `1` flipped 180° |
| `label.mirror` | `0` | `0` normal, `1` mirrored |
| `label.dpmm` | `8` | Dots per mm: `8` = 203 dpi, `11.8` = 300 dpi, `24` = 600 dpi |

To reset all settings to defaults, stop the server and delete `./data/settings.db`;
it will be recreated on the next start.

---

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install server dependencies |
| `npm run frontend:install` | Install frontend (React) dependencies |
| `npm run dev` | Run the API server with hot reload (tsx) |
| `npm run frontend:dev` | Run the Vite dev server (React) on port 5173 |
| `npm run frontend:build` | Build the React app into `public/` |
| `npm run build` | Compile the server TypeScript to `dist/` |
| `npm run build:all` | Build frontend + server in one command |
| `npm start` | Run the compiled server from `dist/` (serves API + frontend) |
| `npm test` | Run the full test suite once (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Lint the `src` and `tests` with ESLint |

Typical local loop:

```bash
npm run dev            # terminal 1: API server
npm run frontend:dev   # terminal 2: React app
npm run typecheck      # verify server types
npm test               # verify server behaviour
npm run build:all      # produce a deployable build
```

---

## HTTP API

Base path: `/api`. All print endpoints return `{ ok, result, tspl }`, where
`tspl` is the exact program sent to the printer and `result` reports the mode
(`network` or `dry-run`) and bytes sent.

### Send a print over the API (quickstart)

The recommended way to print is to **store a template once**, then **print it
many times** with different data. A template is raw TSPL with `{{placeholders}}`;
you supply values at print time. The server substitutes, escapes, and sends.

A ready-to-use template, `tad-inspecao-defect-taxa`, is seeded on first run.

**1. (Optional) list the available templates and their variables:**

```bash
curl http://localhost:8080/api/db-templates
```

**2. Print it — pass a value for each declared variable:**

```bash
curl -X POST http://localhost:8080/api/db-templates/tad-inspecao-defect-taxa/print \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "qrData": "AGM24V-L2",
      "id": "AGM24V-L2",
      "timestamp": "11/09/2026 10:15:32",
      "footer": "BATTERY DEFECT ANALYSIS",
      "m0_label": "TCA",  "m0_value": "84", "m0_ci": "78-88",
      "m1_label": "TCF",  "m1_value": "62", "m1_ci": "55-70",
      "m2_label": "TCAR", "m2_value": "93", "m2_ci": "85-95",
      "m3_label": "IMP",  "m3_value": "45", "m3_ci": "40-55",
      "m4_label": "TAXA", "m4_value": "78", "m4_ci": "70-85",
      "m5_label": "CM",   "m5_value": "12.3","m5_ci": "10-15"
    }
  }'
```

PowerShell:

```powershell
$body = @{
  data = @{
    qrData = 'AGM24V-L2'; id = 'AGM24V-L2'; timestamp = '11/09/2026 10:15:32'
    footer = 'BATTERY DEFECT ANALYSIS'
    m0_label = 'TCA';  m0_value = '84';  m0_ci = '78-88'
    m1_label = 'TCF';  m1_value = '62';  m1_ci = '55-70'
    m2_label = 'TCAR'; m2_value = '93';  m2_ci = '85-95'
    m3_label = 'IMP';  m3_value = '45';  m3_ci = '40-55'
    m4_label = 'TAXA'; m4_value = '78';  m4_ci = '70-85'
    m5_label = 'CM';   m5_value = '12.3';m5_ci = '10-15'
  }
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/db-templates/tad-inspecao-defect-taxa/print `
  -Method POST -ContentType 'application/json' -Body $body
```

The response is `{ ok, template, copies, result, tspl }`. In **dry-run** mode
(`printer.dryRun = true`, the default) nothing is sent to hardware — the `tspl`
is returned so you can inspect or save it. To print for real, set
`printer.dryRun = false` and a valid `printer.ip` (see [Configuration](#settings-sqlite)).

> Prefer **preview before printing** while iterating: `POST
> /api/db-templates/:name/preview` returns the rendered `tspl` **without**
> sending it to the printer.

There are two other ways to print, covered below: the code-defined
[template registry](#template-driven-printing-code-templates) (`POST /api/print`)
and [raw TSPL](#post-apiprintraw).

### `GET /api/health`
Liveness check. Returns `{ "status": "ok", "dryRun": <bool> }`.

### `GET /api/config`
A compact view of current settings. (The React frontend uses `GET /api/settings`
to populate its forms.)

### `GET /api/settings`
The full current settings object:
```json
{
  "printer": { "ip": "192.168.0.50", "port": 9100, "timeoutMs": 5000, "dryRun": true },
  "label": { "widthMm": 45, "heightMm": 75, "gapMm": 3, "direction": 0, "mirror": 0, "dpmm": 8 }
}
```

### `PUT /api/settings`
Partial update — send only the fields you want to change. Merged into the
current settings, validated, and persisted. Returns `{ ok, settings }`.
```json
{ "printer": { "dryRun": false, "ip": "10.0.0.5" }, "label": { "widthMm": 100 } }
```

### Stored templates (`/api/db-templates`)

User-editable templates stored in SQLite. A template is **raw TSPL with
`{{placeholders}}`** plus a **variable manifest** (name, required, sample). This
is the path used by the web UI's template editor and the quickstart above. It is
the most flexible way to author labels — edit the TSPL directly, no code changes.

On save, a template is validated: it must contain `SIZE` and `PRINT`, use a
`GAP`/`BLINE`, and every `{{placeholder}}` must be a declared variable (and vice
versa). At print/preview time, every supplied value is escaped so caller data can
never break out of a quoted argument or inject extra commands, and the output is
normalised to CRLF line endings (required by TSPL).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/db-templates` | List all templates (name, description, source, variables, geometry) |
| GET | `/api/db-templates/:name` | Get one template |
| POST | `/api/db-templates` | Create a template |
| PUT | `/api/db-templates/:name` | Update a template |
| DELETE | `/api/db-templates/:name` | Delete a template |
| POST | `/api/db-templates/:name/preview` | Render to TSPL **without** printing |
| POST | `/api/db-templates/:name/print` | Render and send to the printer |

**Create a template:**

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

**Preview (no printing) — returns `{ ok, name, tspl }`:**

```bash
curl -X POST http://localhost:8080/api/db-templates/hello/preview \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "World" } }'
```

**Print — returns `{ ok, template, copies, result, tspl }`:**

```bash
curl -X POST http://localhost:8080/api/db-templates/hello/print \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "World" } }'
```

Errors:
- `404 TemplateNotFound` — no template with that name.
- `409 TemplateExists` — creating a name that already exists.
- `400 TemplateValidationError` — the TSPL/manifest is invalid (`issues[]` lists
  each problem, e.g. `missing-print`, `undeclared-variable`).
- `400 MissingVariables` — a required variable had no value (`missing[]` names them).

### Template-driven printing (code templates)

An alternative to stored templates: **code-defined** templates compiled into the
server. The caller sends **business data** and names a **template**; the server
owns all layout, coordinate maths, and DPI scaling. The caller never sends dots,
positions, or geometry — those come from the printer/label configuration, so the
same request prints correctly on a 203 or 300 dpi printer. Use stored templates
(above) unless you specifically want computed-geometry layouts in code.

#### `GET /api/templates`
List the available templates and a best-effort description of each template's
expected `data` fields (for building a form in the UI).
```json
[
  { "name": "defect-tag", "description": "...", "dataSchema": { "type": "object", "fields": { "...": {} } } },
  { "name": "simple-label", "description": "...", "dataSchema": { "...": {} } }
]
```

#### `POST /api/print`
The canonical print endpoint. Select a template by name and pass its `data`.

```json
{
  "template": "defect-tag",
  "copies": 1,
  "data": {
    "id": "AGM24V_LINE2",
    "timestamp": "11/09/2026 10:15:32",
    "gauges": [
      { "label": "TCA", "value": 84 },
      { "label": "CM", "value": 12.3, "max": 100 }
    ]
  }
}
```

Flow: look up the template → validate `data` against the template's schema →
resolve geometry + DPI from settings → render to a `LabelSpec` → build TSPL →
send. Returns `{ ok, template, result, tspl }`.

Errors:
- `404 UnknownTemplate` — the `template` name is not registered (response
  includes `available` template names).
- `400 TemplateValidationError` — `data` failed the template's schema
  (response includes `issues` listing the offending fields).

Built-in templates:
- **`defect-tag`** — QR + id + timestamp header, one proportional gauge per row,
  footer. `data`: `id`, `timestamp`, `gauges[]` (`label`, `value`, optional
  `max`), optional `qrData`, `footer`, `direction`.
- **`simple-label`** — `data`: `lines[]` (text) and an optional `barcode`
  (`data`, `type`, `readable`), optional `copies`.

Adding a template: create a `TemplateDefinition` (name, description, zod
`dataSchema`, and a `render(data, { geometry, dpmm }) => LabelSpec`) under
`src/templates/`, then register it in `createDefaultRegistry()`. The layout maths
lives in the render function (e.g. `buildDefectTagSpec`), so it scales to any
label size by construction.

### Legacy print endpoints

These remain for backward compatibility; new integrations should prefer
`POST /api/print`.

### `POST /api/print/test`
Print the built-in demo label.
```json
{ "landscape": true }
```

### `POST /api/print/label`
Print a fully specified label.
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
Element kinds: `text`, `barcode`, and `raw` (`{ "kind": "raw", "command": "DENSITY 8" }`).

### `POST /api/print/raw`
Send raw TSPL command lines verbatim.
```json
{ "commands": ["SIZE 45 mm,75 mm", "GAP 3 mm,0 mm", "CLS", "PRINT 1,1"] }
```

### `POST /api/print/defect-tag`
Print the parameterized **Defect Analysis Tag**. All coordinates are computed
from the current label geometry and DPI (`label.dpmm`), so the layout scales to
any label size and cannot overflow or collide — a header (QR + id + timestamp),
one full-width proportional gauge per row, and a footer. Gauge fills are clamped
to their `max` (default 100).
```json
{
  "id": "AGM24V_LINE2",
  "timestamp": "11/09/2026 10:15:32",
  "gauges": [
    { "label": "TCA", "value": 84 },
    { "label": "TCF", "value": 62 },
    { "label": "TCAR", "value": 93 },
    { "label": "IMP", "value": 45 },
    { "label": "TAX", "value": 78 },
    { "label": "CM", "value": 12.3, "max": 100 }
  ],
  "qrData": "AGM24V_LINE2",
  "footer": "Defect Analysis Tag",
  "direction": 0
}
```

### Examples

curl:
```bash
curl -X POST http://localhost:8080/api/print/test \
  -H "Content-Type: application/json" \
  -d '{"landscape":true}'
```

PowerShell:
```powershell
Invoke-RestMethod -Uri http://localhost:8080/api/print/test `
  -Method POST -ContentType 'application/json' `
  -Body '{"landscape":true}'
```

Error responses:

- `400 ValidationError` — the request body failed schema validation (`issues` lists details).
- `404 NotFound` — unknown `/api/*` route.
- `502 PrinterError` — the printer could not be reached (timeout, refused, etc.).

---

## Coordinates and orientation

- Element `x`/`y` are in **dots** from the top-left origin.
  `203 dpi = 8 dots/mm`, `300 dpi ≈ 11.8 dots/mm`. Set `label.dpmm` to match your printhead.
- **Landscape**: TSC printers have no landscape switch. Content is rotated 90°
  per element. In the built-in test layout, `y` is the shared left margin and
  `x` steps down the label length so rows don't overlap.
- **Whole-label flip**: set `label.direction` to `1` if prints come out upside down.
- Keep elements inside the label: for a 45 mm-wide label at 203 dpi the x range
  is `0..360` dots; for 75 mm the y range is `0..600` dots.

---

## Testing

Tests use **vitest**. They cover the TSPL builder, the test-label layout, env
config, the SQLite settings repository (in-memory DB), the dry-run transport,
and the HTTP API (via **supertest** with an injected fake transport and an
in-memory database, so no printer or on-disk state is involved).

```bash
npm test          # run once
npm run test:watch
```

```
src/**             ← unit under test
tests/
  builder.test.ts    TSPL rendering + string escaping (command-injection safe)
  layouts.test.ts    landscape rotation and element spacing
  config.test.ts     PORT/HOST parsing, defaults, validation errors
  settings.test.ts   settings seed, partial update, validation, persistence
  transport.test.ts  dry-run file writing + directory creation
  api.test.ts        all endpoints (incl. settings), validation, 404 handling
```

---

## Docker

Build and run (single platform). Mount a volume for `./data` so the settings
database survives container restarts:
```bash
docker build -t tsc-printer-server .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -v tsc_data:/app/data \
  tsc-printer-server
```

Then configure the printer at runtime via the settings API:
```bash
curl -X PUT http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"printer":{"dryRun":false,"ip":"192.168.0.50"}}'
```

Multi-arch (amd64 + arm64):
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t tsc-printer-server .
```

The image is a multi-stage build on `node:20-alpine`: the build stage compiles
the server TypeScript **and** builds the React frontend into `public/`; the
runtime stage installs only production dependencies and copies `dist/` and
`public/`. It binds to `0.0.0.0` so the port maps correctly.
`better-sqlite3` ships prebuilt binaries for common platforms; on uncommon
architectures it compiles during `npm ci` (Alpine includes the needed toolchain).

---

## Project structure

```
src/
  config.ts            # env loading + validation (PORT/HOST only)
  index.ts             # entry point (opens DB, starts server, graceful shutdown)
  db/
    database.ts        # SQLite connection + schema (settings + templates tables)
    settings.ts        # settings types, zod schemas, defaults
    settingsRepository.ts  # seed / read / update settings
    templatesRepository.ts # CRUD for stored TSPL templates
    templateSeeds.ts   # built-in templates seeded on first run
  http/
    app.ts             # Express app factory (also serves the frontend)
    routes.ts          # API routes (print + settings + db-templates)
    schemas.ts         # request validation schemas
  printer/
    service.ts         # reads settings, builds TSPL, sends via the transport
    transport.ts       # NetworkTransport (TCP) + DryRunTransport (returns TSPL)
  templates/
    types.ts           # TemplateDefinition, RenderContext (code templates)
    registry.ts        # TemplateRegistry (lookup, validate, render)
    defect-tag.ts      # defect-tag code template
    simple-label.ts    # simple-label code template
    index.ts           # createDefaultRegistry()
    render.ts          # {{placeholder}} substitution + escaping (stored templates)
    string-template.ts # stored-template model, validation, renderTemplate()
  tspl/
    types.ts           # label/element types
    builder.ts         # TSPL string generation + escaping
    layouts.ts         # layout builders (buildDefectTagSpec, test label)
frontend/              # React app (Vite + TypeScript)
  src/
    App.tsx            # top-level layout + shared status/output state
    api.ts             # typed API client
    types.ts           # shared API types
    components/        # SettingsPanel, TestLabelPanel, CustomLabelPanel, RawTsplPanel, ...
  vite.config.ts       # dev proxy + build output to ../public
public/                # built React bundle (generated, gitignored)
tests/                 # vitest unit + API tests (server)
data/                  # SQLite database (created at runtime, gitignored)
Dockerfile             # multi-stage, multi-arch container build
.env.example           # annotated environment template (PORT/HOST)
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `502 PrinterError` / timeout | Wrong `printer.ip`, printer off, or not on the same network. Test with `ping <ip>`. |
| Prints come out upside down | Set `label.direction` to `1` via `PUT /api/settings`. |
| Content clipped off the edge | Coordinates exceed the label. Check `label.dpmm` matches your DPI (203 vs 300). |
| Barcode missing | Its `x`/`y` (plus rotated height) fall outside the printable area — pull it in. |
| Nothing prints but no error | `printer.dryRun` is `true` — the TSPL was downloaded as a `.prn` file instead of sent. Set it to `false`. |
| Settings look wrong / corrupted | Stop the server and delete `./data/settings.db`; defaults are reseeded on start. |
| Server exits at startup | `PORT`/`HOST` is invalid; the error message names the offending variable. |

---

## License

MIT
