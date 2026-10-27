import { describe, expect, it } from 'vitest';
import example from '../examples/cabinet.json';
import { calculateRequirements } from '../src/calculator/calculateRequirements.js';
import { parseAmount } from '../src/web/data.js';
import { createCsv } from '../src/web/exportCsv.js';

describe('numeric input', () => {
  it.each(['', ' ', '0x10', '0b10', '1,2,3', 'Infinity', '12 kg'])(
    'rejects %j rather than reinterpreting it',
    (value) => {
      expect(parseAmount(value)).toBeNaN();
    },
  );
  it.each([
    ['3,5', 3.5],
    [' 3.5 ', 3.5],
    ['.5', 0.5],
    ['1e-7', 0.0000001],
    ['-2', -2],
    ['0', 0],
  ] as const)('parses %s', (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });
});

describe('purchase export', () => {
  it('includes units, package quantities and unrounded purchase amounts', () => {
    const csv = createCsv(calculateRequirements(example));
    expect(csv).toContain('"PLYTA";"m2";"15,4";"3";"12,4";"5,8";"3";"17,4";"5"');
    expect(csv.split('\r\n')).toHaveLength(4);
  });
  it('escapes codes containing separators, quotes and spreadsheet formulas', () => {
    const result = calculateRequirements({
      order: { item: '=A1;"test"', quantity: 1 },
      items: [{ code: '=A1;"test"', unit: 'kg' }],
      bom: [],
      stock: [],
    });
    expect(createCsv(result)).toContain('"\'=A1;""test""";"kg"');
  });
});
