# TSPL Command Reference

Condensed from the TSPL/TSPL2 manual (`docs/tsc-languague-manual.md`). Coordinates
are in **dots** (top-left origin) unless a command explicitly takes mm/inch/dot.
Lines are CRLF-terminated. `[ ]` marks optional parameters.

Conventions from the manual:
- `<ESC>` = ASCII 27, `~` = ASCII 126 (status/immediate control codes).
- Space (ASCII 32) inside a command line is ignored between tokens.
- `"` (ASCII 34) begins/ends a string expression.
- 203 DPI: 1 mm = 8 dots · 300 DPI: 1 mm = 12 dots · 600 DPI: 1 mm = 24 dots.

---

## Setup & system commands

### SIZE — define label dimensions (required, first)
```
SIZE m[,n]              ' inch
SIZE m mm[,n mm]        ' metric (note the space before mm)
SIZE m dot[,n dot]      ' dots
```
- `m` = width, `n` = length. `n` is optional on newer firmware.
- Metric/dot forms REQUIRE a space between the value and `mm`/`dot`.

### GAP — gap between labels (gap-sensor stock)
```
GAP m[,n]               ' inch
GAP m mm[,n mm]         ' metric
GAP m dot[,n dot]       ' dots
```
- `m` = gap distance, `n` = gap offset (usually 0).

### BLINE — black-mark stock (alternative to GAP)
```
BLINE m mm,n mm         ' m = black line height, n = extra feed
```
Use GAP **or** BLINE, not both, depending on media.

### DIRECTION — feed direction and mirror
```
DIRECTION n[,m]
```
- `n` = 0 (normal) or 1 (flip 180°). `m` = 0 normal / 1 mirror.

### REFERENCE / OFFSET / SHIFT
```
REFERENCE x,y           ' set origin, in dots
OFFSET n mm             ' fine feed offset
SHIFT [x,]y             ' move whole label; ±1 inch max, in dots
```

### DENSITY / SPEED
```
DENSITY n               ' 0 (lightest) .. 15 (darkest); default 8
SPEED n                 ' inches per second (model-dependent set)
```

### CLS — clear image buffer (required, after SIZE)
```
CLS
```

### CODEPAGE — character set
```
CODEPAGE n              ' e.g. 1252, 850, UTF-8
```
Set before drawing text with non-ASCII content. This project emits `CODEPAGE UTF-8`.

### FEED / BACKFEED / BACKUP / FORMFEED / HOME
```
FEED n                  ' feed n dots (1..9999)
BACKFEED n              ' TSPL2: reverse n dots
BACKUP n                ' TSPL: reverse n dots
FORMFEED
HOME                    ' feed to origin
```

### CUT / PRINT / SOUND / DELAY / EOJ
```
CUT
PRINT m[,n]             ' m sets (1..999999999), n copies each
SOUND level,interval    ' level 0..9, interval 1..4095
DELAY ms
EOJ                     ' wait for current job to finish
```

---

## Text

### TEXT — built-in / TrueType font string
```
TEXT x,y,"font",rotation,x-mul,y-mul,[alignment,]"content"
```
- `font`: `"0"` (stretchable Triumvirate), `"1".."8"` (fixed dot fonts,
  `1`=8×12 … `5`=32×48, `6/7`=OCR-B, `8`=OCR-A), `"ROMAN.TTF"`.
- `rotation`: 0 | 90 | 180 | 270 (clockwise).
- `x-mul`/`y-mul`: 1..10. For font `"0"`/TTF these set point size (1pt = 1/72 in).
- `alignment` (optional): 1 left, 2 center, 3 right.
- Escape embedded `"` (this project strips them via `escapeTsplString`).

### BLOCK — word-wrapped paragraph
```
BLOCK x,y,width,height,"font",rotation,x-mul,y-mul,[space,][align,][fit,]"content"
```
- `width`/`height` in dots define the wrap box. `fit`=1 shrinks to fit. Max 4092 bytes.

---

## Barcodes (1D)

### BARCODE
```
BARCODE x,y,"code type",height,human readable,rotation,narrow,wide,[alignment,]"content"
```
- `height` in dots.
- `human readable`: 0 none, 1 left, 2 center, 3 right (0/1 commonly used).
- `narrow`/`wide`: element widths in dots (ratio matters per symbology).
- Common `code type` values and content rules:
  - `128` (auto subset), `128M` (manual subset; use `!` + 3-digit control codes, e.g. `!105` start C).
  - `EAN128` / `EAN128M`.
  - `39`, `39C` (check digit), `39S`.
  - `93`.
  - `25` (Interleaved 2of5, even length), `25C` (odd), `25S`, `25I`.
  - `EAN13` (12 data), `EAN13+2`, `EAN13+5`, `EAN8` (7), `EAN8+2`, `EAN8+5`.
  - `UPCA` (11), `UPCE` (6), with `+2`/`+5` add-ons.
  - `CODA` (Codabar), `POST` (Postnet 5/9/11), `MSI`, `MSIC`, `PLESSEY`.
  - `ITF14` (13), `EAN14` (13), `11` (Code 11), `CPOST`.
- GS1/FNC1: with `128M`, encode FNC1 via the manual's control-code scheme, e.g.
  `"!105!10201123456789012312112345"` for GTIN(01)+Serial(21).

---

## 2D codes

### QRCODE
```
QRCODE x,y,ECC,cell width,mode,rotation,[justification,][model,][mask,][area,][length,]"content"
```
- `ECC`: L (7%) | M (15%) | Q (25%) | H (30%).
- `cell width`: 1..10 dots.
- `mode`: `A` (auto) or `M` (manual). This project emits mode `A`.
- Manual-mode content prefixes: `A`=alphanumeric, `N`=numeric, `B`=binary
  (`Bnnnn` byte count), `K`=Kanji, `!`=switch charset.

### DMATRIX (DataMatrix, ECC200)
```
DMATRIX x,y,width,height,[c#,x#,r#,a#,row,col,]"content"
```
- `x#` = module size (dots). `a#`: 0 square, 1 rectangle. `row`/`col` 10..144.
- GS1 via `c126` escape + `~1` FNC1, e.g. `"~101123456789012312112345"`.

### PDF417 / MPDF417 / AZTEC / MAXICODE
```
PDF417 x,y,width,height,rotate,[options,]"content"     ' options: P,E,M,U,W,H,R,C,T,Lm
MPDF417 x,y,rotate,[Wn,][Hn,][Cn,]"content"
AZTEC x,y,rotate,[size,][ecp,][flg,][menu,][multi,][rev,]"content"
MAXICODE x,y,mode,[class,country,post,Lm,]"content"
```

---

## Graphics / shapes

### BAR — solid filled rectangle
```
BAR x,y,width,height        ' all dots
```

### BOX — rectangle outline
```
BOX x,y,x_end,y_end,thickness       ' all dots
```

### DIAGONAL / CIRCLE / ELLIPSE / ERASE / REVERSE
```
DIAGONAL x1,y1,x2,y2,thickness
ERASE x,y,width,height
REVERSE x,y,width,height
```

### Image printing
```
BITMAP x,y,width_bytes,height,mode,<data>   ' mode 0 overwrite, 1 OR, 2 XOR
PUTBMP x,y,"filename"[,bpp,contrast]
PUTPCX x,y,"filename"
PUTPNG x,y,"filename"
```

---

## Status polling & immediate commands (RS-232 / USB / Ethernet)

```
<ESC>!?    ' 1-byte status (00 normal, 01 head open, 04 out of paper, ...)
<ESC>!S    ' 8-byte detailed status (<STX>[4-byte status]<ETX><CR><LF>)
<ESC>!R    ' reset printer (clears downloaded files)
<ESC>!C    ' restart, skip AUTO.BAS
<ESC>!P    ' pause      <ESC>!O  ' cancel pause
~!@        ' query mileage        ~!A  ' query free memory
~!I        ' query codepage,country     ~!T  ' query model
~!F        ' list resident files
```

`<ESC>!?` return values (hex): `00` normal, `01` head open, `02` paper jam,
`04` out of paper, `08` out of ribbon, `10` pause, `20` printing, `80` other.

---

## File / program (BASIC) commands

```
DOWNLOAD [n,]"NAME.BAS"     ' n = F (flash) or E (expansion); default DRAM
EOP                          ' end of BASIC program (pair with DOWNLOAD "...BAS")
FILES                        ' list files
KILL [n,]"NAME"              ' delete (wildcard * supported)
MOVE                         ' DRAM -> flash
RUN "NAME.BAS"
```

`AUTO.BAS` runs automatically at power-up. Program files start with
`DOWNLOAD "NAME.BAS"` and end with `EOP`.
