import type { CreateTemplateInput } from '../templates/string-template.js';

/**
 * Built-in templates seeded into a fresh database. These are the approved raw
 * TSPL layouts converted to `{{placeholder}}` form. Users can edit or delete
 * them from the UI; deleting one just removes the row (it is re-seeded only if
 * the table is empty of that name on a fresh DB).
 */

/**
 * ***REMOVED*** — the rotated (90°) 45x75 mm ***REMOVED***
 * inspection label. This is the exact approved raw TSPL with the product id,
 * timestamp, and the six measurement cells turned into placeholders.
 *
 * Editing the layout = editing this string (or the DB row via the UI). No
 * coordinate maths in code.
 */
const ***REMOVED*** = [
  'SIZE 45 mm,75 mm',
  'GAP 3 mm,0 mm',
  'DIRECTION 1,0',
  'REFERENCE 0,0',
  'CLS',
  'CODEPAGE UTF-8',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  '***REMOVED***',
  'PRINT 1,1',
].join('\n');

function ***REMOVED***(index: number, label: string): CreateTemplateInput['variables'] {
  return [
    { name: `m${index}_label`, required: true, description: `${label} label`, sample: label },
    { name: `m${index}_value`, required: true, description: `${label} value`, sample: '0' },
    { name: `m${index}_ci`, required: true, description: `${label} confidence interval`, sample: '0-0' },
  ];
}

export const SEED_TEMPLATES: CreateTemplateInput[] = [
  {
    name: '***REMOVED***',
    description:
      'Rotated 45x75 mm ***REMOVED*** inspection label: QR + id + timestamp, ' +
      'three bands of six measurement cells (value + CI), and a footer caption.',
    source: ***REMOVED***,
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
    variables: [
      { name: 'qrData', required: true, description: 'QR code payload', sample: 'AGM24V-L2' },
      { name: 'id', required: true, description: 'Product identifier', sample: 'AGM24V-L2' },
      {
        name: 'timestamp',
        required: true,
        description: 'Inspection timestamp',
        sample: '11/09/2026 10:15:32',
      },
      { name: 'footer', required: false, description: 'Footer caption', sample: '***REMOVED***' },
      ...***REMOVED***(0, 'TCA'),
      ...***REMOVED***(1, 'TCF'),
      ...***REMOVED***(2, 'TCAR'),
      ...***REMOVED***(3, 'IMP'),
      ...***REMOVED***(4, 'TAXA'),
      ...***REMOVED***(5, 'CM'),
    ],
  },
];
