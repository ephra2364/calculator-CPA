import type { Period, Product } from './types';

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
export function emptyProduct(partial: Partial<Product> = {}): Product {
  const now = new Date().toISOString();
  return {
    id: uid(), name: '', country: 'Togo', category: '', currency: 'FCFA', price: null,
    costMode: 'import',
    importCosts: { purchaseTotal: null, transport: null, customs: null, transit: null, other: null, quantity: null },
    unitCostDirect: null,
    closingCost: null, closingScope: 'confirmed', deliverySuccessCost: null, deliveryFailCost: null, returnCost: null,
    otherVariableCost: null, fixedCostsMonthly: null, lostRatePct: 0,
    targetCpa: null, dailyBudget: null, totalBudget: null,
    assumedConfirmationPct: null, assumedShippingPct: null, assumedDeliveryPct: null,
    createdAt: now, updatedAt: now,
    ...partial
  };
}
export function emptyPeriod(productId: string, partial: Partial<Period> = {}): Period {
  return {
    id: uid(), productId, start: '', end: '', adSpend: null,
    meta: { impressions: null, cpm: null, ctrAll: null, ctrLink: null, cpcLink: null, linkClicks: null, addToCart: null,
      initiateCheckout: null, metaPurchases: null, metaCpa: null, roas: null, frequency: null },
    orders: { received: null, confirmed: null, shipped: null, delivered: null, refused: null, unreachable: null, returned: null, cancelled: null },
    closingCostOverride: null, deliverySuccessCostOverride: null, deliveryFailCostOverride: null, fixedCosts: null,
    note: '', createdAt: new Date().toISOString(),
    ...partial
  };
}
