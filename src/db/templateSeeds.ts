import type { CreateTemplateInput } from '../templates/string-template.js';

/**
 * Built-in templates seeded into a fresh database. These are the approved raw
 * TSPL layouts converted to `{{placeholder}}` form. Users can edit or delete
 * them from the UI; deleting one just removes the row (it is re-seeded only if
 * the table is empty of that name on a fresh DB).
 */

export const SEED_TEMPLATES: CreateTemplateInput[] = [
  {
    name: 'simple-label',
    description:
      'Basic 45x75 mm label: three text lines with a Code 128 barcode below. ' +
      'Replaces the former built-in code template with an editable TSPL source.',
    source: [
      'SIZE 45 mm,75 mm',
      'GAP 3 mm,0 mm',
      'DIRECTION 0,0',
      'CLS',
      'CODEPAGE UTF-8',
      'TEXT 20,20,"3",0,1,1,"{{line1}}"',
      'TEXT 20,60,"3",0,1,1,"{{line2}}"',
      'TEXT 20,100,"3",0,1,1,"{{line3}}"',
      'BARCODE 20,150,"128",80,1,0,2,4,"{{barcode}}"',
      'PRINT 1,1',
    ].join('\n'),
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
    variables: [
      { name: 'line1', required: true, description: 'First text line', sample: 'Hello' },
      { name: 'line2', required: false, description: 'Second text line', sample: 'World' },
      { name: 'line3', required: false, description: 'Third text line', sample: '' },
      { name: 'barcode', required: true, description: 'Code 128 barcode value', sample: '123456' },
    ],
  },
];
