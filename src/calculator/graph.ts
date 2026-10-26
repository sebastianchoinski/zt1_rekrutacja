import { CalculationError } from './errors.js';
import type { BomLine, CalculationInput } from './input.js';

function findCycle(codes: string[], children: Map<string, BomLine[]>): string[] {
  const state = new Map<string, number>();
  for (const start of codes) {
    if (state.has(start)) continue;
    const stack = [{ code: start, next: 0 }];
    const position = new Map([[start, 0]]);
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const edge = children.get(frame.code)?.[frame.next++];
      if (!edge) {
        state.set(frame.code, 2);
        position.delete(frame.code);
        stack.pop();
      } else if (state.get(edge.component) === 1) {
        return [
          ...stack.slice(position.get(edge.component)!).map((entry) => entry.code),
          edge.component,
        ];
      } else if (!state.has(edge.component)) {
        state.set(edge.component, 1);
        position.set(edge.component, stack.length);
        stack.push({ code: edge.component, next: 0 });
      }
    }
  }
  return [];
}

export function buildGraph(input: CalculationInput) {
  const children = new Map<string, BomLine[]>();
  const indegrees = new Map(input.items.map((item) => [item.code, 0]));
  for (const line of input.bom) {
    const entries = children.get(line.parent) ?? [];
    entries.push(line);
    children.set(line.parent, entries);
    indegrees.set(line.component, indegrees.get(line.component)! + 1);
  }

  const order = [...indegrees].filter(([, degree]) => degree === 0).map(([code]) => code);
  for (let index = 0; index < order.length; index++) {
    for (const line of children.get(order[index]!) ?? []) {
      const remaining = indegrees.get(line.component)! - 1;
      indegrees.set(line.component, remaining);
      if (remaining === 0) order.push(line.component);
    }
  }
  if (order.length !== input.items.length) {
    const cycle = findCycle(
      input.items.map((item) => item.code),
      children,
    );
    throw new CalculationError('BOM_CYCLE', `Cykl w BOM: ${cycle.join(' → ')}.`, [
      { path: 'bom', message: 'Usuń zależność, która zamyka cykl.' },
    ]);
  }
  return { children, order };
}
