import { describe, expect, it } from 'vitest';
import {
  buildLabel,
  buildRawProgram,
  escapeTsplString,
  mmToDots,
} from '../src/tspl/builder.js';
import type { LabelSpec } from '../src/tspl/types.js';

describe('escapeTsplString', () => {
  it('removes embedded double quotes', () => {
    expect(escapeTsplString('say "hi"')).toBe('say hi');
  });

  it('removes CR and LF', () => {
    expect(escapeTsplString('a\r\nb')).toBe('ab');
  });

  it('replaces other control characters with spaces', () => {
    expect(escapeTsplString('a\tb')).toBe('a b');
  });

  it('leaves normal text intact', () => {
    expect(escapeTsplString('Hello 123')).toBe('Hello 123');
  });
});

describe('mmToDots', () => {
  it('converts using 203 dpi (8 dots/mm)', () => {
    expect(mmToDots(45, 8)).toBe(360);
    expect(mmToDots(75, 8)).toBe(600);
  });

  it('rounds to the nearest dot', () => {
    expect(mmToDots(10, 11.8)).toBe(118);
  });
});

describe('buildRawProgram', () => {
  it('joins commands with CRLF and terminates with CRLF', () => {
    const out = buildRawProgram(['CLS', 'PRINT 1,1']);
    expect(out).toBe('CLS\r\nPRINT 1,1\r\n');
  });

  it('trims and drops empty lines', () => {
    const out = buildRawProgram(['  CLS  ', '', '   ', 'PRINT 1,1']);
    expect(out).toBe('CLS\r\nPRINT 1,1\r\n');
  });
});

describe('buildLabel', () => {
  const spec: LabelSpec = {
    geometry: { widthMm: 45, heightMm: 75, gapMm: 3, direction: 0, mirror: 0 },
    elements: [
      {
        kind: 'text',
        x: 60,
        y: 30,
        font: '3',
        rotation: 90,
        xMultiplier: 1,
        yMultiplier: 1,
        content: 'Hello',
      },
      {
        kind: 'barcode',
        x: 180,
        y: 30,
        type: '128',
        height: 70,
        readable: 0,
        rotation: 90,
        narrow: 3,
        wide: 1,
        content: '123456',
      },
      { kind: 'raw', command: 'DENSITY 8' },
    ],
    quantity: 2,
    copies: 1,
  };

  it('emits geometry commands in order', () => {
    const out = buildLabel(spec);
    const lines = out.trimEnd().split('\r\n');
    expect(lines[0]).toBe('SIZE 45 mm,75 mm');
    expect(lines[1]).toBe('GAP 3 mm,0 mm');
    expect(lines[2]).toBe('DIRECTION 0,0');
    expect(lines[3]).toBe('CLS');
    expect(lines[4]).toBe('CODEPAGE UTF-8');
  });

  it('renders TEXT elements correctly', () => {
    expect(buildLabel(spec)).toContain('TEXT 60,30,"3",90,1,1,"Hello"');
  });

  it('renders BARCODE elements correctly', () => {
    expect(buildLabel(spec)).toContain('BARCODE 180,30,"128",70,0,90,3,1,"123456"');
  });

  it('passes raw commands through', () => {
    expect(buildLabel(spec)).toContain('DENSITY 8');
  });

  it('ends with a PRINT command using quantity and copies', () => {
    const out = buildLabel(spec);
    const lines = out.trimEnd().split('\r\n');
    expect(lines[lines.length - 1]).toBe('PRINT 2,1');
  });

  it('escapes dangerous content in text', () => {
    const evil: LabelSpec = {
      ...spec,
      elements: [
        {
          kind: 'text',
          x: 0,
          y: 0,
          font: '3',
          rotation: 0,
          xMultiplier: 1,
          yMultiplier: 1,
          content: 'a"\r\nPRINT 99,99',
        },
      ],
    };
    const out = buildLabel(evil);
    // The injected quote/newline must not create a second command line.
    expect(out).not.toContain('PRINT 99,99\r\n');
    expect(out).toContain('TEXT 0,0,"3",0,1,1,"aPRINT 99,99"');
  });
});
