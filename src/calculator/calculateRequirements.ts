import Big from 'big.js';
import { CalculationError } from './errors.js';
import { buildGraph } from './graph.js';
import { validateInput } from './input.js';
import type { CalculationResult, Contribution, PlanEntry, PurchaseRequirement } from './types.js';

// Addition, subtraction and multiplication stay exact. Division is used only
// to count whole purchase packs, so round its positive result upward directly.
const Amount = Big();
Amount.DP = 0;
Amount.RM = Big.roundUp;

// Exact arithmetic keeps every digit, so a value can gain digits at each BOM level and the
// total work grows quadratically with depth. Bounding the digits of intermediate demand keeps
// the cost per BOM line constant, so one request cannot occupy the server for minutes.
const MAX_SIGNIFICANT_DIGITS = 500;

function limitPrecision(value: Big, item: string): Big {
  // `c` holds the significant digits of a Big number (see the big.js documentation).
  if ((value as unknown as { c: number[] }).c.length > MAX_SIGNIFICANT_DIGITS) {
    throw new CalculationError(
      'CALCULATION_RANGE',
      `Zapotrzebowanie dla „${item}” wymaga zbyt dużej precyzji obliczeń. Zmniejsz liczbę miejsc po przecinku w recepturze.`,
    );
  }
  return value;
}

function asNumber(value: Big, item: string): number {
  const result = value.toNumber();
  if (
    !Number.isFinite(result) ||
    value.gt(Number.MAX_SAFE_INTEGER) ||
    (value.gt(0) && result === 0)
  ) {
    throw new CalculationError(
      'CALCULATION_RANGE',
      `Zapotrzebowanie dla „${item}” przekracza obsługiwany zakres liczb.`,
    );
  }
  return result;
}

export function calculateRequirements(value: unknown): CalculationResult {
  const input = validateInput(value);
  const graph = buildGraph(input);
  const items = new Map(input.items.map((item) => [item.code, item]));
  const inventory = new Map(input.stock.map((entry) => [entry.item, new Amount(entry.quantity)]));
  const demand = new Map([[input.order.item, new Amount(input.order.quantity)]]);
  const sources = new Map<string, Contribution[]>();
  const requirements: PurchaseRequirement[] = [];
  const plan: PlanEntry[] = [];

  // All parents precede a component, so shared demand is complete before we use
  // its stock or round production. Iteration also avoids a depth-dependent call stack.
  for (const code of graph.order) {
    const gross = demand.get(code) ?? new Amount(0);
    if (gross.eq(0)) continue;
    const item = items.get(code)!;
    const stock = inventory.get(code) ?? new Amount(0);
    const stockUsed = stock.lt(gross) ? stock : gross;
    const net = gross.gt(stock) ? gross.minus(stock) : new Amount(0);
    const children = graph.children.get(code);
    const production = children ? (item.unit === 'szt' ? net.round(0) : net) : new Amount(0);
    const quantities = {
      item: code,
      unit: item.unit,
      gross: asNumber(gross, code),
      stock: asNumber(stock, code),
      stockUsed: asNumber(stockUsed, code),
      net: asNumber(net, code),
    };

    plan.push({
      ...quantities,
      type: children ? 'manufactured' : 'purchased',
      productionQuantity: asNumber(production, code),
      sources: sources.get(code) ?? [],
    });

    if (children && production.gt(0)) {
      for (const line of children) {
        const componentDemand = limitPrecision(
          production.times(line.quantity).times(new Amount(line.wastePct).times('0.01').plus(1)),
          line.component,
        );
        const contributions = sources.get(line.component) ?? [];
        contributions.push({
          parent: code,
          productionQuantity: asNumber(production, code),
          quantityPerParent: line.quantity,
          wastePct: line.wastePct,
          gross: asNumber(componentDemand, line.component),
        });
        sources.set(line.component, contributions);
        demand.set(
          line.component,
          (demand.get(line.component) ?? new Amount(0)).plus(componentDemand),
        );
      }
    } else if (!children && net.gt(0)) {
      const packages = item.purchasePack === undefined ? null : net.div(item.purchasePack);
      const purchase = packages
        ? packages.times(item.purchasePack!)
        : item.unit === 'szt'
          ? net.round(0)
          : net;
      requirements.push({
        ...quantities,
        purchasePack: item.purchasePack ?? null,
        packages: packages ? asNumber(packages, code) : null,
        purchaseQuantity: asNumber(purchase, code),
        surplus: asNumber(purchase.minus(net), code),
      });
    }
  }
  requirements.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  return { order: { ...input.order, unit: items.get(input.order.item)!.unit }, requirements, plan };
}
