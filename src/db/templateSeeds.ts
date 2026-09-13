import type { CreateTemplateInput } from '../templates/string-template.js';

/**
 * Built-in templates seeded into a fresh database. These are the approved raw
 * TSPL layouts converted to `{{placeholder}}` form. Users can edit or delete
 * them from the UI; deleting one just removes the row (it is re-seeded only if
 * the table is empty of that name on a fresh DB).
 */

/**
 * tad-inspecao-defect-taxa — the rotated (90°) 45x75 mm battery-defect
 * inspection label. This is the exact approved raw TSPL with the product id,
 * timestamp, and the six measurement cells turned into placeholders.
 *
 * Editing the layout = editing this string (or the DB row via the UI). No
 * coordinate maths in code.
 */
const TAD_INSPECAO_DEFECT_TAXA_SOURCE = [
  'SIZE 45 mm,75 mm',
  'GAP 3 mm,0 mm',
  'DIRECTION 1,0',
  'REFERENCE 0,0',
  'CLS',
  'CODEPAGE UTF-8',
  'QRCODE 330,20,M,7,A,90,"{{qrData}}"',
  'TEXT 305,200,"5",90,1,1,"{{id}}"',
  'TEXT 245,200,"3",90,1,1,"{{timestamp}}"',
  'BAR 165,15,3,570',
  'TEXT 150,40,"2",90,1,1,"{{m0_label}} {{m0_value}}"',
  'TEXT 130,40,"1",90,1,1,"CI {{m0_ci}}"',
  'TEXT 150,240,"2",90,1,1,"{{m1_label}} {{m1_value}}"',
  'TEXT 130,240,"1",90,1,1,"CI {{m1_ci}}"',
  'TEXT 150,440,"2",90,1,1,"{{m2_label}} {{m2_value}}"',
  'TEXT 130,440,"1",90,1,1,"CI {{m2_ci}}"',
  'BAR 115,15,3,570',
  'TEXT 100,40,"2",90,1,1,"{{m3_label}} {{m3_value}}"',
  'TEXT 80,40,"1",90,1,1,"CI {{m3_ci}}"',
  'TEXT 100,240,"2",90,1,1,"{{m4_label}} {{m4_value}}"',
  'TEXT 80,240,"1",90,1,1,"CI {{m4_ci}}"',
  'TEXT 100,440,"2",90,1,1,"{{m5_label}} {{m5_value}}"',
  'TEXT 80,440,"1",90,1,1,"CI {{m5_ci}}"',
  'BAR 65,15,3,570',
  'TEXT 40,40,"1",90,1,1,"{{footer}}"',
  'PRINT 1,1',
].join('\n');

function measurementVars(index: number, label: string): CreateTemplateInput['variables'] {
  return [
    { name: `m${index}_label`, required: true, description: `${label} label`, sample: label },
    { name: `m${index}_value`, required: true, description: `${label} value`, sample: '0' },
    { name: `m${index}_ci`, required: true, description: `${label} confidence interval`, sample: '0-0' },
  ];
}

export const SEED_TEMPLATES: CreateTemplateInput[] = [
  {
    name: 'tad-inspecao-defect-taxa',
    description:
      'Rotated 45x75 mm battery-defect inspection label: QR + id + timestamp, ' +
      'three bands of six measurement cells (value + CI), and a footer caption.',
    source: TAD_INSPECAO_DEFECT_TAXA_SOURCE,
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
      { name: 'footer', required: false, description: 'Footer caption', sample: 'BATTERY DEFECT ANALYSIS' },
      ...measurementVars(0, 'TCA'),
      ...measurementVars(1, 'TCF'),
      ...measurementVars(2, 'TCAR'),
      ...measurementVars(3, 'IMP'),
      ...measurementVars(4, 'TAXA'),
      ...measurementVars(5, 'CM'),
    ],
  },
];
