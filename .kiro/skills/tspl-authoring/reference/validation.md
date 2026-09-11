# TSPL Validation & Troubleshooting

A catalog of common mistakes when authoring TSPL, the symptom each produces on
real hardware, and the fix. Use alongside `commands.md`. Grounded in the manual
(`docs/tsc-languague-manual.md`) and this project's builder (`src/tspl/`).

## How to validate a TSPL program

Validate structurally (does it parse / obey ordering) then semantically (will it
render inside the label). There is no need to send to a printer to catch most
faults.

### 1. Structural checks (ordering & syntax)

| Check | Rule |
|-------|------|
| First command | Must be `SIZE`. |
| Stock detect | Exactly one of `GAP` / `BLINE` present after `SIZE`. |
| Buffer clear | `CLS` present and **after** `SIZE`. |
| Terminator | `PRINT m[,n]` present and **last**. |
| Line endings | Every command line ends with CRLF (`\r\n`); program ends with CRLF. |
| One command/line | No two commands on one line; TSPL is line-oriented. |
| Unit spacing | `mm`/`dot` forms have a space: `3 mm`, `24 dot` (never `3mm`). |
| Quotes balanced | Every string arg opens and closes with `"`; no stray `"` inside. |

### 2. Semantic checks (geometry & content)

| Check | Rule |
|-------|------|
| Coordinates | Integer, `≥ 0`, in **dots**, within `SIZE` converted to dots. |
| Rotation | One of `0, 90, 180, 270`. |
| Multipliers | `TEXT` x/y multipliers in `1..10`. |
| Barcode length | Content matches symbology charset/length (see `commands.md`). |
| PRINT range | `1 ≤ m ≤ 999999999`; `n` (copies) `≥ 1` if present. |
| DENSITY | `0..15` if set. |
| QR ECC | One of `L, M, Q, H`; cell width `1..10`. |

### 3. Bounds math

Convert `SIZE` to dots using the target printhead density, then confirm every
element fits:

```
Wdots = round(widthMm  * dotsPerMm)
Hdots = round(heightMm * dotsPerMm)
```
- `TEXT`/`BARCODE`/`QRCODE` start at `(x,y)` and extend right/down. Estimate
  extent (barcode height, text size × multiplier) and ensure it stays `< Wdots/Hdots`.
- `BOX x,y,xEnd,yEnd`: require `0 ≤ x < xEnd ≤ Wdots` and `0 ≤ y < yEnd ≤ Hdots`.
- `BAR x,y,width,height`: require `x+width ≤ Wdots`, `y+height ≤ Hdots`.

`dotsPerMm`: 203 DPI → 8, 300 DPI → 12 (manual also cites ~11.8), 600 DPI → 24.
Only the integer part of a dot value is used by firmware.

---

## Failure catalog

### Nothing prints / blank label
- **Missing `PRINT`** — nothing is committed. Add `PRINT 1,1`.
- **`CLS` before `SIZE`** — buffer clear is rejected. Put `CLS` after `SIZE`.
- **All elements off-canvas** — `x`/`y` exceed `SIZE` in dots. Recheck bounds math.
- **Wrong stock command** — using `GAP` on black-mark media (or vice versa) mis-detects the label. Switch to `BLINE` / `GAP` to match media.

### Wrong label length / feeds multiple blanks
- **`SIZE` doesn't match physical stock** — length is wrong; printer feeds past.
- **`GAP` value wrong** — gap sensor can't find the gap; use `GAPDETECT`/`AUTODETECT` or correct the gap size.

### Content clipped or shifted
- **Coordinates in mm not dots** — a value meant as mm was written as a raw
  coordinate. All drawing coords are dots. Convert with `mmToDots`.
- **`x`/`y` swapped or off by a margin** — remember origin is top-left; `y` grows downward.
- **`DIRECTION 1` unexpectedly** — flips the label 180°; verify intended orientation.

### Parse errors / garbled output
- **Missing space before `mm`/`dot`** (`SIZE 50mm`) — invalid; write `SIZE 50 mm`.
- **Raw `"` inside a quoted string** — terminates the argument early. Strip/replace
  it (`escapeTsplString` removes `"`, CR, LF, control chars).
- **CR/LF or control char inside content** — breaks the line. Sanitize content.
- **Wrong parameter count/order** — every command has a fixed signature; align to
  `commands.md`. Example `TEXT` needs exactly `x,y,"font",rot,xmul,ymul,[align,]"content"`.
- **Two commands on one line** — split onto separate CRLF-terminated lines.

### Barcode won't scan / rejected
- **Content violates symbology** — e.g. `EAN13` needs 12 numeric digits; `25`
  (Interleaved 2of5) needs an even-length numeric string (`25C` odd). Fix length/charset.
- **`narrow`/`wide` ratio invalid for the type** — some types ignore/require specific ratios; see the ratio table in the manual's BARCODE section.
- **Human-readable overlaps other content** — reserve vertical space for the text line.

### Text problems
- **Non-ASCII shows wrong glyphs** — set `CODEPAGE` (this project uses `UTF-8`) before the `TEXT`.
- **Font `"0"` size unexpected** — for font `"0"`/TTF the multipliers are point sizes, not integer scale factors.

### Immediate/status commands
- **`<ESC>!?` returns non-zero** — decode via the status table in `commands.md`
  (`01` head open, `04` out of paper, `08` out of ribbon, `10` pause...). Resolve the
  hardware condition; don't retry the print blindly.

---

## Minimal known-good templates

Portrait, gap stock, 203 DPI:
```
SIZE 50 mm,25 mm
GAP 3 mm,0 mm
DIRECTION 1,0
CLS
CODEPAGE UTF-8
TEXT 10,10,"3",0,1,1,"OK"
PRINT 1,1
```

With a Code 128 barcode and a box:
```
SIZE 50 mm,25 mm
GAP 3 mm,0 mm
DIRECTION 1,0
CLS
CODEPAGE UTF-8
BOX 5,5,395,195,2
TEXT 20,20,"3",0,1,1,"SKU-4471"
BARCODE 20,70,"128",80,1,0,2,2,"4471"
PRINT 1,1
```

Black-mark stock:
```
SIZE 40 mm,30 mm
BLINE 3 mm,0 mm
DIRECTION 0,0
CLS
TEXT 10,10,"3",0,1,1,"BLINE media"
PRINT 1,1
```

## Cross-check against the project builder

When validating output produced by `src/tspl/builder.ts`, expect exactly:
`SIZE` → `GAP` → `DIRECTION` → `CLS` → `CODEPAGE UTF-8` → elements → `PRINT`,
each line CRLF-terminated, quoted content passed through `escapeTsplString`.
Any deviation from that order for builder-generated streams is a regression.
