import type { CalculationInput } from './input.js';

export interface Quantities {
  item: string;
  unit: string;
  gross: number;
  stock: number;
  stockUsed: number;
  net: number;
}

export interface PurchaseRequirement extends Quantities {
  purchasePack: number | null;
  packages: number | null;
  purchaseQuantity: number;
  surplus: number;
}

export interface Contribution {
  parent: string;
  productionQuantity: number;
  quantityPerParent: number;
  wastePct: number;
  gross: number;
}

export interface PlanEntry extends Quantities {
  type: 'manufactured' | 'purchased';
  productionQuantity: number;
  sources: Contribution[];
}

export interface CalculationResult {
  order: CalculationInput['order'] & { unit: string };
  requirements: PurchaseRequirement[];
  plan: PlanEntry[];
}

export interface CalculationSummary {
  id: string;
  createdAt: string;
  orderItem: string;
  orderQuantity: number;
  materialCount: number;
}

export interface SavedCalculation extends CalculationSummary {
  input: CalculationInput;
  result: CalculationResult;
}
