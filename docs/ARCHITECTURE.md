# Architecture & Design Patterns

This document explains how the TSC Printer Server is put together and the
patterns it relies on. It is aimed at contributors — for install/run/API usage
see the [README](../README.md).

## Guiding philosophy

Thin, injectable layers behind interfaces; schema-driven validation with types
inferred from those schemas; and pure functions for rendering. Together these
make the whole stack testable end to end **without a printer** — a fake
transport and an in-memory database stand in for hardware and disk.

## Layers

Each layer depends only on the one below it. The printer connection sits behind
an interface so the stack is exercised without hardware.

```
        React app (frontend/, Vite + TS)  →  built to public/, served by Express
                                  │  HTTP + JSON
                                  ▼
   HTTP layer (src/http)          app.ts factory + error middleware
                                  routes/* per-resource modules
                                  schemas.ts (zod)  ·  errors.ts (error → HTTP)
                                  │  validated request
                                  ▼
   Templates (src/templates)      string-template.ts: schemas, validation,
                                  {{placeholder}} render engine → raw TSPL
                                  │  rendered / built TSPL
                                  ▼
   Service (src/printer)          service.ts: read settings, build TSPL, send
              │                        │                       │
              ▼                        ▼                       ▼
   TSPL (src/tspl)            DB (src/db)             Transport (src/printer)
   builder.ts (+validateSpec) database.ts (+migrate) NetworkTransport (TCP :9100)
   types.ts                   settingsRepository.ts  DryRunTransport
                              templatesRepository.ts PrinterError
                                  │                       │
                                  ▼                       ▼
                          SQLite (DB_PATH)        printer  or  TSPL to client
```

## Patterns by category

The patterns below are grouped by their formal classification: the Gang of Four
(GoF) creational/structural/behavioral families, then architectural,
enterprise/data-source, functional/type-level, and framework-idiom patterns.

### GoF — Creational

#### Factory Method
Repository constructors are pure (they only prepare statements). A static
`create(db)` factory constructs **and** seeds defaults, keeping construction
separate from the seeding side effect. Prefer `SettingsRepository.create(db)` /
`TemplatesRepository.create(db)` at startup. *(`src/db/*Repository.ts`)*

#### (Simple) Factory / builder function
`createApp({ settings, templates, service? })` assembles a fully wired Express
app from its collaborators without starting it. `openDatabase(...)` similarly
produces a ready, migrated connection. *(`src/http/app.ts`, `src/db/database.ts`)*

### GoF — Structural

#### Adapter / Facade
The frontend `api.ts` wraps the browser `fetch` API in a single typed
`request<T>()` and exposes a domain-shaped `api.*` object — a facade over HTTP
the UI talks to instead of raw fetch. `ApiError` adapts the server's JSON error
body into a typed error with `code` + `status`. *(`frontend/src/api.ts`)*

#### Composite
`Card` and the `Field` family (`Fieldset`, `NumberField`, `SelectField`,
`TextField`) are composed to build every panel — small components assembled into
larger UIs. *(`frontend/src/components/`)*

### GoF — Behavioral

#### Strategy
`PrinterTransport` is the strategy interface; `NetworkTransport` (real TCP) and
`DryRunTransport` are interchangeable implementations. `PrinterService`
`.transportFor()` selects one per print based on the live `dryRun` setting.
*(`src/printer/transport.ts`, `service.ts`)*

#### Null Object
`DryRunTransport` is a safe no-op stand-in for a real printer: it returns the
generated TSPL and touches no hardware, so the whole stack runs with nothing
connected. *(`src/printer/transport.ts`)*

#### Template Method (light)
`renderTemplate` fixes the algorithm — enforce required variables → substitute
placeholders → normalise to CRLF — while delegating the substitution step to
`renderStringTemplate`. *(`src/templates/string-template.ts`)*

### Architectural

#### Layered architecture
HTTP → templates/rendering → service → (tspl builder · db · transport). Each
layer depends only on the one below it. See the diagram above.

#### Repository
`SettingsRepository` / `TemplatesRepository` encapsulate all SQLite access
behind domain methods (`get`, `list`, `create`, `update`, `delete`, …). Callers
never write SQL; each repository owns its prepared statements. *(`src/db/`)*

#### Dependency Injection
`PrinterService` takes the settings repository + an optional transport;
`createApp(...)` takes its collaborators as arguments. This is what lets tests
inject a fake transport and an in-memory DB and exercise the API end to end.
*(`src/printer/service.ts`, `src/http/app.ts`)*

#### App factory (construction separate from start)
`createApp()` builds the Express app but does not `listen()`; `index.ts` wires
everything and starts the server, so `supertest` can mount the app in-process.
*(`src/http/app.ts`, `src/index.ts`)*

#### Centralized error mapping (error middleware)
Handlers and the domain throw typed errors; a single `mapError()` translates
each to an HTTP status + body, applied by one Express error middleware.
Unrecognised errors become `500` without leaking internals, and handlers stay
free of `try/catch`. *(`src/http/errors.ts`, `app.ts`)*

### Enterprise / Data-source

#### Migrations (versioned schema)
`database.ts` applies an ordered `MIGRATIONS` array keyed off SQLite
`PRAGMA user_version`; each entry advances the schema by one version and runs
idempotently in a transaction on open. Append new migrations; never edit
existing ones. *(`src/db/database.ts`)*

#### Typed Domain Errors (Notification-style)
`ValidationError`, `SpecValidationError`, `StringTemplateValidationError`,
`MissingVariablesError`, `TemplateNotFoundError`, `TemplateExistsError`, and
`PrinterError` carry structured detail (issue lists, missing names, failure
reason) rather than bare strings, so the transport layer can render precise
responses. *(across `src/`)*

#### Schema-first validation (Parse, don't validate)
zod schemas are the single source of truth for request bodies, settings, and
templates; domain types are inferred via `z.infer` (one definition, not a
parallel type + validator). The settings update schema is derived from the base
with `.partial()` so they cannot drift. Validation runs on both read and write.
*(`src/http/schemas.ts`, `src/db/settings.ts`, `src/templates/string-template.ts`)*

### Functional / Type-level

#### Pure functions (referential transparency)
`escapeTsplString`, `buildLabel`, `buildRawProgram`, `validateSpec`,
`renderStringTemplate`, and `normalizeTsplLineEndings` perform no I/O, so they
are trivially unit-testable and reused across the print and preview paths.
*(`src/tspl/`, `src/templates/`)*

#### Discriminated union + exhaustiveness check
`LabelElement` is a `kind`-tagged union (`text`/`barcode`/`qrcode`/`bar`/`box`/
`raw`); `renderElement` switches on `kind` with a `never` default, so adding an
element kind is a compile error until handled everywhere. *(`src/tspl/`)*

### React / Framework idioms

#### Custom hooks (encapsulated state + effects)
- `useTemplates()` — single source of truth for the template list, shared by the
  Print and Templates panels so a create/delete in one is reflected in the other.
- `usePrinterStatus()` — reachability polling with exponential backoff,
  focus/visibility re-probe, and an unmount guard. *(`frontend/src/hooks/`)*

#### Lifted state + shared prop contract
`App.tsx` owns cross-cutting state (settings, connection, preview) and injects
`onStatus`/`onPreview` into panels through a shared `PanelProps` type. Panels
stay mounted (hidden when inactive) to preserve form state across view switches.
*(`frontend/src/App.tsx`, `types.ts`)*

#### Container / Presentational split
Feature panels (containers) own data and effects; `Card`/`Field` primitives
(presentational) own layout and markup. *(`frontend/src/components/`)*

## Cross-cutting conventions

- **ESM throughout**, TypeScript strict mode, `.js` import specifiers.
- **Config split** — only `PORT`/`HOST`/`DB_PATH` come from `.env` (fail-fast
  zod validation at startup). Everything else lives in SQLite and is editable at
  runtime through the settings API.
- **Security by construction** — every substituted template value is escaped so
  it cannot break out of a quoted TSPL argument or inject commands; the `raw`
  element / `/api/print/raw` path is the explicit, documented trust boundary.
- **Bounds validation** — `validateSpec` rejects elements that fall off the
  label (for the current DPI) with `400 SpecValidationError`, before anything
  reaches the printer.
- **Tests live in `tests/`** (not beside source), organised by concern, using a
  fake transport and an in-memory SQLite DB so no hardware or on-disk state is
  touched.
- **Conventional Commits** for history.

## Testing strategy

The layering above is what makes the stack testable without hardware:

- Pure functions (`builder`, `validateSpec`, `renderStringTemplate`) are unit
  tested directly.
- Repositories are tested against an in-memory SQLite DB (`:memory:`).
- The HTTP API is tested via `supertest` against `createApp(...)` with an
  injected fake transport — no socket, no printer, no disk.
- Migrations, config parsing, transport failure paths, and error mapping each
  have focused suites.

See the [README Testing section](../README.md#testing) for the file listing.
