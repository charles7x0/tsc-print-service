---
name: tspl-authoring
description: Construct and validate raw TSPL/TSPL2 label programs for TSC printers. Use when writing, reviewing, debugging, or generating TSPL command streams (SIZE/GAP/DIRECTION/CLS/TEXT/BARCODE/QRCODE/BAR/BOX/PRINT, etc.), converting mm to dots, escaping quoted content, or wiring label output through this project's src/tspl builder.
---

# TSPL Authoring & Validation

Guidance for producing correct, printable TSPL (and TSPL2) command streams for TSC
label printers, grounded in the TSPL manual (`docs/tsc-languague-manual.md`) and this
project's builder (`src/tspl/`).

## When to use this skill

- Writing a raw TSPL program by hand or generating one programmatically.
- Reviewing/validating a TSPL stream before it is sent to a printer.
- Debugging blank labels, cut-off content, mis-positioned elements, or parse errors.
- Extending `src/tspl/builder.ts`, `layouts.ts`, or `types.ts` with new commands.

## Core mental model

1. **Units are dots, origin is top-left `(0,0)`.** Only `SIZE`/`GAP`/`OFFSET`/`SHIFT`
   accept mm or inch. Everything drawn (`TEXT`, `BARCODE`, `BAR`, `BOX`, `QRCODE`,
   coordinates) is in **dots**.
2. **Dot density depends on the printhead:**
   - 203 DPI → `1 mm = 8 dots`
   - 300 DPI → `1 mm = 12 dots` (manual also cites ~11.8; use 12 for math, 11.8 only where the project already does)
   - 600 DPI → `1 mm = 24 dots`
   - Only the integer part of a dot value is used (e.g. `2 mm = 23.6 dots → 23`).
3. **A label program is an ordered pipeline.** Setup commands must come before
   drawing; `CLS` must come after `SIZE`; `PRINT` comes last.
4. **Lines end with CRLF (`\r\n`).** The manual denotes this as `CR, LF`.

## Canonical program skeleton

```tspl
SIZE 50 mm,25 mm
GAP 3 mm,0 mm
DIRECTION 1,0
REFERENCE 0,0
CLS
CODEPAGE UTF-8
TEXT 10,10,"3",0,1,1,"Hello"
BARCODE 10,60,"128",70,1,0,2,2,"123456"
PRINT 1,1
```

Order that must hold:
1. `SIZE` (required, first)
2. `GAP` **or** `BLINE` (label stock detection)
3. `DIRECTION` / `MIRROR` / `OFFSET` / `SHIFT` / `REFERENCE` (optional setup)
4. `CLS` (required, clears image buffer — must follow `SIZE`)
5. `CODEPAGE` (optional but recommended before text with non-ASCII)
6. Drawing commands (`TEXT`, `BARCODE`, `QRCODE`, `BAR`, `BOX`, `DMATRIX`, ...)
7. `PRINT m[,n]` (required, last)

## Validation checklist

Run through this before declaring a TSPL stream correct. Details and the full
command grammar are in `reference/commands.md`; the failure catalog is in
`reference/validation.md`.

- [ ] `SIZE` present and first; width/height match the physical stock.
- [ ] `GAP` (or `BLINE`) present; for `mm`/`dot` there is a **space** before the unit (`3 mm`, not `3mm`).
- [ ] `CLS` present and appears **after** `SIZE`.
- [ ] Every drawing coordinate is a non-negative integer in **dots** and lies within `SIZE` bounds.
- [ ] Quoted string arguments contain no raw `"` (strip or replace), no CR/LF, no other control chars.
- [ ] Every command's parameter **count and order** matches the manual signature.
- [ ] Rotation is one of `0 | 90 | 180 | 270`.
- [ ] `PRINT` present, last, with `1 ≤ m ≤ 999999999` (and `n` copies if used).
- [ ] Barcode `content` fits the symbology's allowed charset/length (see `reference/commands.md`).
- [ ] Lines are CRLF-terminated; the whole program ends with CRLF.

## Building programmatically in this project

Prefer the typed builder over string concatenation. It already enforces CRLF,
emits the correct setup order, sets `CODEPAGE UTF-8`, and escapes quoted content.

- `buildLabel(spec: LabelSpec)` — full pipeline from a structured spec.
- `buildRawProgram(commands: string[])` — join pre-formed command lines with CRLF.
- `mmToDots(mm, dotsPerMm)` — unit conversion.
- `escapeTsplString(value)` — strip `"`, CR, LF, and control chars from content.

Add a new command by extending `LabelElement` in `types.ts`, adding a
`renderX()` in `builder.ts`, and wiring it into `renderElement()` (the `never`
exhaustiveness check will flag a missing case at compile time). Keep coordinates
in dots and derive positions from geometry so layouts scale across DPI, matching
`buildDefectTagSpec` in `layouts.ts`.

## Reference files

Load these on demand for depth:

- `reference/commands.md` — command-by-command syntax, parameters, and examples
  for the commands used in this project plus common extras (setup, text, barcodes,
  2D codes, graphics, status/immediate).
- `reference/validation.md` — a catalog of common TSPL mistakes, the symptom each
  produces on hardware, and the fix. Use it when debugging.

## Non-negotiable rules

- Never emit a drawing command before `CLS`, and never before `SIZE`.
- Never place a raw `"` inside a quoted argument; escape via `escapeTsplString`.
- Never use `&&`-style shell chaining assumptions — TSPL is line-oriented, one command per CRLF line.
- Treat 300 DPI carefully: the manual lists both `12` and `~11.8` dots/mm; match whatever the target printer profile defines rather than guessing.
