import { describe, expect, it } from 'vitest';
import example from '../examples/cabinet.json';
import { calculateRequirements } from '../src/calculator/calculateRequirements.js';
import { CalculationError } from '../src/calculator/errors.js';
import type { CalculationInput } from '../src/calculator/input.js';

const fixture = (): CalculationInput => structuredClone(example);
const line = (parent: string, component: string, quantity = 1, wastePct = 0) => ({
  parent,
  component,
  quantity,
  wastePct,
});
const simple = (): CalculationInput => ({
  order: { item: 'A', quantity: 1 },
  items: [
    { code: 'A', unit: 'szt' },
    { code: 'M', unit: 'm2' },
  ],
  bom: [line('A', 'M')],
  stock: [],
});

// 0.3 × (1 + 0.7 + ... + 0.7^(depth - 1)) + 0.7^depth = 1 exactly.
const fractionalChain = (): CalculationInput => {
  const depth = 170;
  const input: CalculationInput = {
    order: { item: 'N0', quantity: 1 },
    items: Array.from({ length: depth + 1 }, (_, index) => ({
      code: `N${index}`,
      unit: 'kg',
    })),
    bom: [],
    stock: [],
  };
  input.items.push({ code: 'M', unit: 'kg', purchasePack: 1 });
  for (let index = 0; index < depth; index++) {
    input.bom.push(line(`N${index}`, 'M', 0.3), line(`N${index}`, `N${index + 1}`, 0.7));
  }
  input.bom.push(line(`N${depth}`, 'M'));
  return input;
};

describe('calculateRequirements', () => {
  it('calculates the example including shared plate demand and intermediate stock', () => {
    const result = calculateRequirements(fixture());
    expect(result.requirements).toEqual([
      {
        item: 'OBRZEZE',
        unit: 'mb',
        gross: 37.8,
        stock: 0,
        stockUsed: 0,
        net: 37.8,
        purchasePack: null,
        packages: null,
        purchaseQuantity: 37.8,
        surplus: 0,
      },
      {
        item: 'PLYTA',
        unit: 'm2',
        gross: 15.4,
        stock: 3,
        stockUsed: 3,
        net: 12.4,
        purchasePack: 5.8,
        packages: 3,
        purchaseQuantity: 17.4,
        surplus: 5,
      },
      {
        item: 'ZAWIAS',
        unit: 'szt',
        gross: 20,
        stock: 5,
        stockUsed: 5,
        net: 15,
        purchasePack: null,
        packages: null,
        purchaseQuantity: 15,
        surplus: 0,
      },
    ]);
    expect(result.plan.find((entry) => entry.item === 'KORPUS')?.productionQuantity).toBe(6);
    expect(result.plan.find((entry) => entry.item === 'PLYTA')?.sources).toEqual([
      {
        parent: 'SZAFKA',
        productionQuantity: 10,
        quantityPerParent: 0.5,
        wastePct: 10,
        gross: 5.5,
      },
      { parent: 'KORPUS', productionQuantity: 6, quantityPerParent: 1.5, wastePct: 10, gross: 9.9 },
    ]);
  });

  it('uses finished product stock before exploding any components', () => {
    const input = fixture();
    input.stock.push({ item: 'SZAFKA', quantity: 10 });
    const result = calculateRequirements(input);
    expect(result.requirements).toEqual([]);
    expect(result.plan).toHaveLength(1);
  });

  it('uses partial finished product stock', () => {
    const input = fixture();
    input.stock.push({ item: 'SZAFKA', quantity: 3 });
    const result = calculateRequirements(input);
    expect(result.plan.find((entry) => entry.item === 'SZAFKA')?.productionQuantity).toBe(7);
    expect(result.plan.find((entry) => entry.item === 'KORPUS')?.productionQuantity).toBe(3);
  });

  it('combines shared subassembly demand at different depths before using stock and rounding', () => {
    const input: CalculationInput = {
      order: { item: 'A', quantity: 1 },
      items: ['A', 'B', 'X', 'M'].map((code) => ({ code, unit: 'szt' })),
      bom: [line('A', 'X', 0.6), line('A', 'B'), line('B', 'X', 0.6), line('X', 'M', 2)],
      stock: [{ item: 'X', quantity: 1 }],
    };
    const result = calculateRequirements(input);
    expect(result.plan.find((entry) => entry.item === 'X')).toMatchObject({
      gross: 1.2,
      stockUsed: 1,
      net: 0.2,
      productionQuantity: 1,
    });
    expect(result.requirements[0]).toMatchObject({ item: 'M', gross: 2 });
  });

  it('applies waste independently at every level', () => {
    const input: CalculationInput = {
      order: { item: 'A', quantity: 10 },
      items: ['A', 'B', 'M'].map((code) => ({ code, unit: 'kg' })),
      bom: [line('A', 'B', 2, 10), line('B', 'M', 3, 20)],
      stock: [],
    };
    expect(calculateRequirements(input).requirements[0]?.gross).toBe(79.2);
  });

  it('counts shared material stock once, and does not purchase covered demand', () => {
    const input = fixture();
    input.stock.find((entry) => entry.item === 'PLYTA')!.quantity = 16;
    const result = calculateRequirements(input);
    expect(result.requirements.some((entry) => entry.item === 'PLYTA')).toBe(false);
    expect(result.plan.find((entry) => entry.item === 'PLYTA')).toMatchObject({
      gross: 15.4,
      stock: 16,
      stockUsed: 15.4,
      net: 0,
    });
  });

  it('aggregates all paths before rounding packs', () => {
    const input = simple();
    input.items.push({ code: 'B', unit: 'szt' });
    input.items[1]!.purchasePack = 1;
    input.bom = [line('A', 'M', 0.4), line('A', 'B'), line('B', 'M', 0.4)];
    expect(calculateRequirements(input).requirements[0]).toMatchObject({
      gross: 0.8,
      packages: 1,
      purchaseQuantity: 1,
    });
  });

  it('handles exact decimal package boundaries without an extra pack', () => {
    const input = simple();
    input.items.push({ code: 'B', unit: 'szt' });
    input.items[1]!.purchasePack = 0.1;
    input.bom = [line('A', 'M', 0.1), line('A', 'B'), line('B', 'M', 0.2)];
    expect(calculateRequirements(input).requirements[0]).toMatchObject({
      gross: 0.3,
      packages: 3,
      purchaseQuantity: 0.3,
      surplus: 0,
    });
  });

  it('does not erase a real shortfall with an epsilon', () => {
    const input = simple();
    input.items[1]!.purchasePack = 0.1;
    input.bom[0]!.quantity = 0.30000000000000004;
    expect(calculateRequirements(input).requirements[0]?.packages).toBe(4);
  });

  it('does not add a pack after accumulating decimal fractions through a deep BOM', () => {
    expect(calculateRequirements(fractionalChain()).requirements[0]).toMatchObject({
      gross: 1,
      net: 1,
      packages: 1,
      purchaseQuantity: 1,
      surplus: 0,
    });
  });

  it('uses stock covering the exact total of a deep fractional BOM', () => {
    const input = fractionalChain();
    input.stock.push({ item: 'M', quantity: 1 });
    const result = calculateRequirements(input);
    expect(result.requirements).toEqual([]);
    expect(result.plan.find((entry) => entry.item === 'M')).toMatchObject({ net: 0 });
  });

  it('does not round a shared manufactured piece upward due to accumulated decimal error', () => {
    const input = fractionalChain();
    input.items[input.items.length - 1] = { code: 'M', unit: 'szt' };
    input.items.push({ code: 'RAW', unit: 'kg' });
    input.bom.push(line('M', 'RAW'));
    const result = calculateRequirements(input);
    expect(result.plan.find((entry) => entry.item === 'M')?.productionQuantity).toBe(1);
    expect(result.requirements[0]).toMatchObject({ item: 'RAW', purchaseQuantity: 1 });
  });

  it('preserves tiny contributions alongside larger demand before subtracting stock', () => {
    const input = simple();
    input.items.push({ code: 'B', unit: 'szt' });
    input.items[1]!.purchasePack = 1;
    input.bom = [line('A', 'M'), line('A', 'B'), line('B', 'M', 1e-100)];
    input.stock.push({ item: 'M', quantity: 1 });
    expect(calculateRequirements(input).requirements[0]).toMatchObject({
      net: 1e-100,
      packages: 1,
      purchaseQuantity: 1,
    });
  });

  it('preserves a positive waste surcharge even when it is much smaller than the base demand', () => {
    const input = simple();
    input.items[1]!.purchasePack = 1;
    input.bom[0]!.wastePct = 1e-100;
    expect(calculateRequirements(input).requirements[0]?.packages).toBe(2);
  });

  it('rounds purchases in szt upward after waste', () => {
    const input = simple();
    input.items[1]!.unit = 'szt';
    input.bom[0]!.wastePct = 10;
    expect(calculateRequirements(input).requirements[0]).toMatchObject({
      gross: 1.1,
      net: 1.1,
      purchaseQuantity: 2,
      surplus: 0.9,
    });
  });

  it('accepts a zero order with no production or purchases', () => {
    const input = fixture();
    input.order.quantity = 0;
    expect(calculateRequirements(input)).toMatchObject({ requirements: [], plan: [] });
  });

  it('allows an order for a purchased item without a BOM', () => {
    const input = simple();
    input.order = { item: 'M', quantity: 2.5 };
    expect(calculateRequirements(input).requirements[0]).toMatchObject({ item: 'M', net: 2.5 });
  });

  it('does not depend on input ordering', () => {
    const input = fixture();
    const expected = calculateRequirements(input).requirements;
    input.items.reverse();
    input.bom.reverse();
    input.stock.reverse();
    expect(calculateRequirements(input).requirements).toEqual(expected);
  });

  it('does not mutate inputs or retain stock between calls', () => {
    const input = fixture();
    const before = structuredClone(input);
    const result = calculateRequirements(input);
    expect(input).toEqual(before);
    expect(calculateRequirements(input)).toEqual(result);
  });

  it('handles 5,000 levels without recursive stack overflow', () => {
    const input: CalculationInput = {
      order: { item: 'N0', quantity: 1 },
      items: [],
      bom: [],
      stock: [],
    };
    for (let index = 0; index < 5000; index++) {
      input.items.push({ code: `N${index}`, unit: 'szt' });
      if (index > 0) input.bom.push(line(`N${index - 1}`, `N${index}`));
    }
    expect(calculateRequirements(input).requirements[0]).toMatchObject({ item: 'N4999', net: 1 });
  });

  it('rejects quickly a deep BOM whose exact values would keep growing in precision', () => {
    const depth = 3000;
    const input: CalculationInput = {
      order: { item: 'N0', quantity: 1.0000000000000002 },
      items: [],
      bom: [],
      stock: [],
    };
    for (let index = 0; index < depth; index++) {
      input.items.push({ code: `N${index}`, unit: 'kg' });
      if (index > 0) input.bom.push(line(`N${index - 1}`, `N${index}`, 1.0000000000000002, 1e-16));
    }
    expect(() => calculateRequirements(input)).toThrow(CalculationError);
    expect(() => calculateRequirements(input)).toThrow('zbyt dużej precyzji');
    try {
      calculateRequirements(input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'CALCULATION_RANGE' });
    }
  });

  it('still calculates a long BOM with ordinary decimal quantities', () => {
    const input: CalculationInput = {
      order: { item: 'N0', quantity: 1 },
      items: [],
      bom: [],
      stock: [],
    };
    for (let index = 0; index < 40; index++) {
      input.items.push({ code: `N${index}`, unit: 'kg' });
      if (index > 0) input.bom.push(line(`N${index - 1}`, `N${index}`, 1.25, 2.5));
    }
    expect(calculateRequirements(input).requirements).toHaveLength(1);
  });

  it('ignores unrelated valid BOM demand while validating the whole catalog', () => {
    const input = simple();
    input.items.push({ code: 'UNUSED', unit: 'szt' });
    input.bom.push(line('UNUSED', 'M', 1000));
    expect(calculateRequirements(input).requirements[0]?.gross).toBe(1);
  });
});

describe('invalid inputs', () => {
  it.each(['M\u0000', 'M\uD800', 'M\uDC00', 'M\uD800X'])(
    'rejects text that cannot be stored in PostgreSQL: %j',
    (code) => {
      const input = simple();
      input.items[1]!.code = code;
      input.bom[0]!.component = code;
      expect(() => calculateRequirements(input)).toThrow(CalculationError);
      try {
        calculateRequirements(input);
      } catch (error) {
        expect(error).toMatchObject({
          code: 'INVALID_INPUT',
          issues: expect.arrayContaining([expect.objectContaining({ path: 'items.1.code' })]),
        });
      }
    },
  );

  it('accepts correctly paired Unicode characters', () => {
    const input = simple();
    input.items[1]!.code = 'PLYTA🪵';
    input.items[1]!.unit = 'm²';
    input.bom[0]!.component = 'PLYTA🪵';
    expect(calculateRequirements(input).requirements[0]).toMatchObject({
      item: 'PLYTA🪵',
      unit: 'm²',
    });
  });

  it('reports the cycle path', () => {
    const input = simple();
    input.bom.push(line('M', 'A'));
    expect(() => calculateRequirements(input)).toThrow('A → M → A');
  });
  it('rejects self cycles even outside the order', () => {
    const input = simple();
    input.items.push({ code: 'UNUSED', unit: 'szt' });
    input.bom.push(line('UNUSED', 'UNUSED'));
    expect(() => calculateRequirements(input)).toThrow('UNUSED → UNUSED');
  });
  it.each([
    [
      'unknown component',
      (input: CalculationInput) => {
        input.bom[0]!.component = 'UNKNOWN';
      },
    ],
    [
      'unknown parent',
      (input: CalculationInput) => {
        input.bom[0]!.parent = 'UNKNOWN';
      },
    ],
    [
      'unknown order',
      (input: CalculationInput) => {
        input.order.item = 'UNKNOWN';
      },
    ],
    [
      'unknown stock',
      (input: CalculationInput) => {
        input.stock.push({ item: 'UNKNOWN', quantity: 1 });
      },
    ],
    [
      'duplicate item',
      (input: CalculationInput) => {
        input.items.push({ ...input.items[0]! });
      },
    ],
    [
      'duplicate BOM',
      (input: CalculationInput) => {
        input.bom.push({ ...input.bom[0]! });
      },
    ],
    [
      'duplicate stock',
      (input: CalculationInput) => {
        input.stock.push({ item: 'M', quantity: 1 }, { item: 'M', quantity: 2 });
      },
    ],
    [
      'negative stock',
      (input: CalculationInput) => {
        input.stock.push({ item: 'M', quantity: -1 });
      },
    ],
    [
      'fractional piece order',
      (input: CalculationInput) => {
        input.order.quantity = 1.5;
      },
    ],
    [
      'fractional piece stock',
      (input: CalculationInput) => {
        input.stock.push({ item: 'A', quantity: 0.5 });
      },
    ],
    [
      'zero BOM quantity',
      (input: CalculationInput) => {
        input.bom[0]!.quantity = 0;
      },
    ],
    [
      'negative waste',
      (input: CalculationInput) => {
        input.bom[0]!.wastePct = -1;
      },
    ],
    [
      'waste above 100%',
      (input: CalculationInput) => {
        input.bom[0]!.wastePct = 101;
      },
    ],
    [
      'zero pack',
      (input: CalculationInput) => {
        input.items[1]!.purchasePack = 0;
      },
    ],
    [
      'fractional piece pack',
      (input: CalculationInput) => {
        input.items[1]!.unit = 'szt';
        input.items[1]!.purchasePack = 1.5;
      },
    ],
    [
      'pack on a manufactured item',
      (input: CalculationInput) => {
        input.items[0]!.purchasePack = 5;
      },
    ],
    [
      'non-finite amount',
      (input: CalculationInput) => {
        input.order.quantity = Infinity;
      },
    ],
    [
      'whitespace in code',
      (input: CalculationInput) => {
        input.items[0]!.code = ' A ';
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const input = simple();
    mutate(input);
    expect(() => calculateRequirements(input)).toThrow(CalculationError);
    try {
      calculateRequirements(input);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
        ]),
      });
    }
  });
  it.each([null, {}, [], { ...simple(), unexpected: true }, { ...simple(), stock: undefined }])(
    'rejects malformed input %#',
    (input) => {
      expect(() => calculateRequirements(input)).toThrow(CalculationError);
    },
  );
  it('reports excessive demand as a readable error', () => {
    const input = simple();
    input.order.quantity = Number.MAX_SAFE_INTEGER;
    input.bom[0]!.quantity = 2;
    expect(() => calculateRequirements(input)).toThrow('przekracza obsługiwany zakres');
  });
});
