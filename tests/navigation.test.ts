import { describe, expect, it } from 'vitest';
import { calculationPath, parseRoute } from '../src/web/navigation.js';

const id = '8a88e65d-24c2-4524-9951-3c0e210fba15';

describe('calculation addresses', () => {
  it('creates a readable address that identifies an existing calculation', () => {
    const path = calculationPath({ id, orderItem: 'SZAFKA ŁAZIENKOWA' });
    expect(path).toBe(`/historia/szafka-lazienkowa-${id}`);
    expect(parseRoute(path)).toEqual({ kind: 'calculation', id });
  });

  it('keeps calculations for the same product at distinct addresses', () => {
    const first = calculationPath({ id, orderItem: 'SZAFKA' });
    const second = calculationPath({
      id: 'ba88e65d-24c2-4524-9951-3c0e210fba15',
      orderItem: 'SZAFKA',
    });
    expect(first).not.toBe(second);
  });

  it('supports item codes that contain no URL-friendly letters', () => {
    expect(calculationPath({ id, orderItem: '🪵' })).toBe(`/historia/kalkulacja-${id}`);
  });

  it.each([
    ['/', { kind: 'calculator' }],
    ['/historia', { kind: 'history' }],
    ['/historia/', { kind: 'history' }],
    [`/historia/szafka-${id}/`, { kind: 'calculation', id }],
    ['/historia/brak', { kind: 'not-found' }],
    ['/historia/a/b', { kind: 'not-found' }],
    ['/inna-strona', { kind: 'not-found' }],
  ])('recognizes %s', (path, expected) => {
    expect(parseRoute(path as string)).toEqual(expected);
  });
});
