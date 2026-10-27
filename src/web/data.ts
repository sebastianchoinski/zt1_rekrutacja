import type { CalculationInput } from '../calculator/input.js';

export interface Draft {
  order: { item: string; quantity: string };
  items: { code: string; unit: string; purchasePack: string }[];
  bom: { parent: string; component: string; quantity: string; wastePct: string }[];
  stock: { item: string; quantity: string }[];
}

export function toDraft(input: CalculationInput): Draft {
  return {
    order: { ...input.order, quantity: String(input.order.quantity) },
    items: input.items.map((item) => ({
      ...item,
      purchasePack: item.purchasePack === undefined ? '' : String(item.purchasePack),
    })),
    bom: input.bom.map((line) => ({
      ...line,
      quantity: String(line.quantity),
      wastePct: String(line.wastePct),
    })),
    stock: input.stock.map((entry) => ({ ...entry, quantity: String(entry.quantity) })),
  };
}

export function parseAmount(value: string): number {
  const text = value.trim();
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)
    ? Number(text.replace(',', '.'))
    : NaN;
}

export function toInput(draft: Draft): CalculationInput {
  return {
    order: { item: draft.order.item, quantity: parseAmount(draft.order.quantity) },
    items: draft.items.map((item) => ({
      code: item.code,
      unit: item.unit,
      ...(item.purchasePack.trim() === '' ? {} : { purchasePack: parseAmount(item.purchasePack) }),
    })),
    bom: draft.bom.map((line) => ({
      parent: line.parent,
      component: line.component,
      quantity: parseAmount(line.quantity),
      wastePct: parseAmount(line.wastePct),
    })),
    stock: draft.stock.map((entry) => ({
      item: entry.item,
      quantity: parseAmount(entry.quantity),
    })),
  };
}

const numbers = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 8 });
export const format = (value: number) =>
  value > 0 && value < 0.00000001 ? '< 0,00000001' : numbers.format(value);
export const unit = (value: string) => (value === 'm2' ? 'm²' : value === 'm3' ? 'm³' : value);

export function fieldLocation(path: string, draft?: Draft): string {
  const [group, index, field] = path.split('.');
  const names: Record<string, string> = {
    order: 'Zamówienie',
    items: 'Katalog',
    bom: 'Receptura',
    stock: 'Magazyn',
  };
  const fields: Record<string, string> = {
    code: 'kod',
    item: 'element',
    parent: 'element z recepturą',
    component: 'składnik',
    unit: 'jednostka',
    purchasePack: 'opakowanie',
    quantity: 'ilość',
    wastePct: 'odpad',
  };
  const row = index && /^\d+$/.test(index) ? Number(index) : undefined;
  const code =
    row === undefined
      ? undefined
      : group === 'items'
        ? draft?.items[row]?.code
        : group === 'stock'
          ? draft?.stock[row]?.item
          : group === 'bom' && draft?.bom[row]
            ? `${draft.bom[row]!.parent} → ${draft.bom[row]!.component}`
            : undefined;
  if (code) return [code, field && fields[field]].filter(Boolean).join(' · ');
  const fieldName = row === undefined ? index : field;
  return [
    names[group ?? ''] ?? 'Dane',
    row === undefined ? undefined : `wiersz ${row + 1}`,
    fields[fieldName ?? ''],
  ]
    .filter(Boolean)
    .join(' · ');
}
