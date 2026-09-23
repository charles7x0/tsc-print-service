<div align="center">

[![License][badge-license]][link-license]

<br/>

<img src="images/tsc_server_logo.png" width="320" alt="TSC Printer Server logo" />

### TSC Printer Server

Cross-platform HTTP server for TSC label printers — raw TSPL over TCP, no native DLL

<br/>

[![Node.js][badge-nodejs]][link-nodejs]
[![Express][badge-express]][link-express]
[![TypeScript][badge-typescript]][link-typescript]
[![React][badge-react]][link-react]
[![SQLite][badge-sqlite]][link-sqlite]

</div>

## Quick Start

1. `npm install && npm run frontend:install`
2. `cp .env.example .env`
3. `npm run build:all`
4. `npm start`

Then open <http://localhost:8080>.

> [!NOTE]
> The server talks to TSC label printers with raw **TSPL over TCP (port 9100)** — no native DLL, so it runs the same on Linux, Windows, and ARM (Raspberry Pi, containers). It starts in **dry-run mode**, so you can try everything with no printer connected.

## What You Can Do

Everything below is available from the web UI at <http://localhost:8080> and over the HTTP API.

- **Design a label once, reuse it** — Create a template (a label layout with `{{placeholders}}` for the parts that change, like an id or a date). Save it by name.
- **Print by filling in a form** — Pick a saved template, type in the values, and print. The fields come from the template's placeholders automatically.
- **See a live preview** — The label preview updates as you type or edit, so you know what will print before you send it.
- **Test without a printer** — In dry-run mode nothing is sent to hardware; the label is generated and downloaded as a `.prn` file so you can inspect or archive it.
- **Print to a real printer** — Enter the printer's IP address in Settings, switch off dry-run, and print over the network.
- **Check the printer connection** — A status indicator shows whether the printer is reachable, with a one-click re-test.
- **Adjust label and printer settings** — Set label size, gap, orientation, print resolution (DPI), printer IP/port, and timeouts. Changes take effect immediately, no restart.
- **Print a quick test label** — A built-in demo label to confirm the printer and settings work.
- **Send raw TSPL** — For advanced users, paste TSPL commands directly and print or download them.

Templates and settings are stored in a small local database, so they survive restarts and can be edited any time.

## Features

- **Stored, editable templates** — Raw TSPL with `{{placeholders}}`, saved and edited in the browser or over the API. All templated printing goes through these; nothing is hardcoded.
- **Live label preview** — The UI renders what the label will look like as you edit.
- **Dry-run mode** — Generate and download the TSPL with no printer connected.
- **HTTP API** — Print from a template, a built-in test label, a custom label, or raw TSPL.
- **Runtime settings** — Printer and label configuration stored in a database and editable live; only `PORT`/`HOST`/`DB_PATH` live in `.env`.
- **Cross-platform** — Pure TypeScript over TCP (no native DLL, no `edge-js`); runs on Linux, Windows, and ARM.
- **Docker support** — Small Alpine-based image for amd64 and arm64.

## Links

- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Docker](#docker)
- [Troubleshooting](#troubleshooting)
- [Architecture](docs/ARCHITECTURE.md)
- [License](#license)

## Getting Started

### Prerequisites

- **Node.js** 18+ (verified on Node 22)
- A **TSC printer** reachable over the network — or use dry-run mode for no hardware

### Install, build, run

```bash
npm install                 # server dependencies
npm run frontend:install    # web UI dependencies
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run build:all           # build the web UI + compile the server
npm start                   # serve API + UI on http://localhost:8080
```

On first run the server creates its database and starts in **dry-run** mode, so nothing needs a printer. To print for real, set the printer IP and turn off dry-run in Settings (or via the API):

```bash
curl -X PUT http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"printer":{"dryRun":false,"ip":"192.168.0.50"}}'
```

### Development

```bash
npm run dev             # API in watch mode
npm run frontend:dev    # web UI dev server (http://localhost:5173, proxies /api)
npm run typecheck       # type-check
npm run lint            # lint
npm test                # run tests
```

## Configuration

Configuration is split in two:

- **Environment (`.env`)** — only how the HTTP server binds and where the database lives.
- **Settings (database)** — printer connection and label defaults, editable at runtime via the web UI or `PUT /api/settings`.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces, needed in Docker) |
| `DB_PATH` | `./data/settings.db` | SQLite database file path |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `printer.ip` | `192.168.0.50` | Printer IP address |
| `printer.port` | `9100` | Raw TSPL port (standard for TSC network printers) |
| `printer.timeoutMs` | `5000` | Socket connect/write timeout |
| `printer.lingerMs` | `500` | How long to hold the socket open after sending, so the printer commits the job |
| `printer.dryRun` | `true` | `true` returns the TSPL to the client instead of sending to a printer |
| `label.widthMm` | `45` | Label width (mm) |
| `label.heightMm` | `75` | Label height (mm) |
| `label.gapMm` | `3` | Gap between labels (mm) |
| `label.direction` | `0` | `0` normal, `1` flipped 180° |
| `label.mirror` | `0` | `0` normal, `1` mirrored |
| `label.dpmm` | `8` | Dots per mm: `8` = 203 dpi, `11.8` = 300 dpi, `24` = 600 dpi |

To reset settings to defaults, stop the server and delete the database file; it is recreated on next start.

## API Reference

Base path: `/api`. Print endpoints return `{ ok, result, tspl }`, where `tspl` is the exact program sent and `result` reports the mode (`network` or `dry-run`) and bytes sent.

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/settings` | Current settings |
| PUT | `/api/settings` | Partial update (merged, validated, persisted) |
| POST | `/api/test-connection` | Probe whether the printer is reachable |

### Templates

Templates are **raw TSPL with `{{placeholders}}`** plus a list of variables. On save they are validated (must contain `SIZE`, `PRINT`, and a `GAP`/`BLINE`, and every placeholder must be declared). At print time each value is escaped so it can't break out of a quoted argument.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/db-templates` | List templates |
| GET | `/api/db-templates/:name` | Get one template |
| POST | `/api/db-templates` | Create a template |
| PUT | `/api/db-templates/:name` | Update a template |
| DELETE | `/api/db-templates/:name` | Delete a template |
| POST | `/api/db-templates/:name/preview` | Render to TSPL **without** printing |
| POST | `/api/db-templates/:name/print` | Render and send to the printer |

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

Print it (or use `/preview` to get the TSPL without printing):

```bash
curl -X POST http://localhost:8080/api/db-templates/hello/print \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "World" } }'
```

A ready-to-use example template is seeded on first run — list `/api/db-templates` to see it.

**Errors:** `404 TemplateNotFound`, `409 TemplateExists`, `400 TemplateValidationError` (invalid TSPL/manifest), `400 MissingVariables` (a required value was omitted).

### Low-level printing

For printing without a stored template.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/print/test` | Print the built-in demo label (`{ "landscape": true }`) |
| POST | `/api/print/label` | Print a fully specified label (geometry + elements) |
| POST | `/api/print/raw` | Send raw TSPL command lines verbatim |

```bash
curl -X POST http://localhost:8080/api/print/raw \
  -H "Content-Type: application/json" \
  -d '{ "commands": ["SIZE 45 mm,75 mm", "GAP 3 mm,0 mm", "CLS", "PRINT 1,1"] }'
```

**Errors:** `400 ValidationError` (bad request body), `400 SpecValidationError` (an element falls off the label for the current DPI), `502 PrinterError` (printer unreachable).

## Docker

Runs the API and web UI in one container. Mount a volume for `/app/data` so settings and templates survive restarts:

```bash
docker build -t tsc-printer-server .
docker run --rm -p 8080:8080 -v tsc_data:/app/data tsc-printer-server
```

Then set the printer via the settings API (see [Getting Started](#getting-started)). Multi-arch build:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t tsc-printer-server .
```

> [!NOTE]
> Behind a TLS-inspection proxy (e.g. Zscaler), drop your proxy's root CA into `certs/` as a `.crt` file before building — the build trusts it via `NODE_EXTRA_CA_CERTS` and never ships it in the runtime image.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `502 PrinterError` / timeout | Wrong printer IP, printer off, or different network. Test with `ping <ip>`. |
| Prints come out upside down | Set `label.direction` to `1` in Settings. |
| Content clipped off the edge | Check `label.dpmm` matches your printer's DPI (203 vs 300). |
| Nothing prints, but no error | Dry-run is on — the label was downloaded as a `.prn` instead of sent. Turn dry-run off. |
| Settings look wrong / corrupted | Stop the server and delete the database file; defaults are recreated on start. |
| Server won't start | `PORT`/`HOST`/`DB_PATH` is invalid; the error names the offending variable. |

## Architecture

For the layered design and the patterns the codebase uses, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

This project follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): short imperative description`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`.

## License

MIT

<!-- Badge images -->
[badge-license]: https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge&labelColor=ececec
[badge-nodejs]: https://img.shields.io/badge/Node.js-18+-339933.svg?style=for-the-badge&logo=node.js&logoColor=339933&labelColor=ececec
[badge-express]: https://img.shields.io/badge/Express-4-000000.svg?style=for-the-badge&logo=express&logoColor=000000&labelColor=ececec
[badge-typescript]: https://img.shields.io/badge/TypeScript-5-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=3178C6&labelColor=ececec
[badge-react]: https://img.shields.io/badge/React-18-61DAFB.svg?style=for-the-badge&logo=react&logoColor=61DAFB&labelColor=ececec
[badge-sqlite]: https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg?style=for-the-badge&logo=sqlite&logoColor=003B57&labelColor=ececec

<!-- Badge links -->
[link-license]: https://opensource.org/licenses/MIT
[link-nodejs]: https://nodejs.org/
[link-express]: https://expressjs.com/
[link-typescript]: https://www.typescriptlang.org/
[link-react]: https://react.dev/
[link-sqlite]: https://github.com/WiseLibs/better-sqlite3
