import type { AppData, Period } from './types';
import { emptyPeriod, emptyProduct, uid } from './factory';
import { addDays, todayIso } from './format';

// Données d'exemple (clairement marquées « Exemple ») pour tester l'application.
type W = { spend: number; cpm: number; ctr: number; freq: number; rec: number; conf: number; ship: number; del: number; ref: number; unr: number; ret?: number; meta: number };

function weeks(productId: string, ws: W[]): Period[] {
  const end = addDays(todayIso(), -1);
  return ws.map((w, i) => {
    const back = ws.length - 1 - i;
    const e = addDays(end, -7 * back), s = addDays(e, -6);
    const impressions = Math.round((w.spend / w.cpm) * 1000);
    const linkClicks = Math.round((impressions * w.ctr) / 100);
    return emptyPeriod(productId, {
      start: s, end: e, adSpend: w.spend,
      meta: { impressions, cpm: w.cpm, ctrAll: Math.round(w.ctr * 1.8 * 100) / 100, ctrLink: w.ctr, cpcLink: Math.round(w.spend / linkClicks),
        linkClicks, addToCart: Math.round(linkClicks * 0.09), initiateCheckout: Math.round(linkClicks * 0.06), metaPurchases: w.meta,
        metaCpa: Math.round(w.spend / w.meta), roas: null, frequency: w.freq },
      orders: { received: w.rec, confirmed: w.conf, shipped: w.ship, delivered: w.del, refused: w.ref, unreachable: w.unr, returned: w.ret ?? 0, cancelled: w.rec - w.conf },
      note: 'Exemple'
    });
  });
}

export function exampleData(): AppData {
  const a = emptyProduct({
    id: uid(), name: 'Exemple — Montre connectée', country: 'Côte d’Ivoire', category: 'Électronique', price: 15000, isExample: true,
    costMode: 'import', importCosts: { purchaseTotal: 2_500_000, transport: 600_000, customs: 400_000, transit: 150_000, other: 50_000, quantity: 1000 },
    closingCost: 400, closingScope: 'confirmed', deliverySuccessCost: 1500, deliveryFailCost: 1000, returnCost: 300, otherVariableCost: 200,
    fixedCostsMonthly: 150_000, lostRatePct: 5, targetCpa: 2500, dailyBudget: 25_000, totalBudget: 750_000
  });
  const b = emptyProduct({
    id: uid(), name: 'Exemple — Ceinture de massage', country: 'Sénégal', category: 'Santé & bien-être', price: 20000, isExample: true,
    costMode: 'unit', unitCostDirect: 6000,
    closingCost: 500, closingScope: 'confirmed', deliverySuccessCost: 2000, deliveryFailCost: 1500, returnCost: 500,
    otherVariableCost: 0, fixedCostsMonthly: 100_000, lostRatePct: 10, targetCpa: 3000, dailyBudget: 30_000
  });
  const c = emptyProduct({
    id: uid(), name: 'Exemple — Lampe solaire', country: 'Togo', category: 'Maison', price: 9000, isExample: true,
    costMode: 'unit', unitCostDirect: 3800,
    closingCost: 500, closingScope: 'all', deliverySuccessCost: 1500, deliveryFailCost: 1500, returnCost: 500,
    otherVariableCost: 0, fixedCostsMonthly: 50_000, lostRatePct: 15, targetCpa: 1500, dailyBudget: 15_000
  });
  const periods = [
    ...weeks(a.id, [
      { spend: 170_000, cpm: 1100, ctr: 1.9, freq: 1.4, rec: 82, conf: 66, ship: 64, del: 53, ref: 7, unr: 4, meta: 95 },
      { spend: 175_000, cpm: 1120, ctr: 1.95, freq: 1.5, rec: 86, conf: 69, ship: 67, del: 56, ref: 7, unr: 4, meta: 99 },
      { spend: 180_000, cpm: 1090, ctr: 2.0, freq: 1.6, rec: 90, conf: 72, ship: 70, del: 58, ref: 8, unr: 4, meta: 104 }
    ]).map((p) => ({ ...p, fixedCosts: 35_000 })),
    ...weeks(b.id, [
      { spend: 210_000, cpm: 1000, ctr: 2.1, freq: 1.6, rec: 95, conf: 76, ship: 74, del: 61, ref: 9, unr: 4, meta: 105 },
      { spend: 210_000, cpm: 1220, ctr: 1.75, freq: 2.4, rec: 78, conf: 62, ship: 60, del: 49, ref: 7, unr: 4, meta: 86 },
      { spend: 210_000, cpm: 1480, ctr: 1.4, freq: 3.1, rec: 60, conf: 47, ship: 46, del: 37, ref: 6, unr: 3, meta: 66 }
    ]).map((p) => ({ ...p, fixedCosts: 25_000 })),
    ...weeks(c.id, [
      { spend: 100_000, cpm: 800, ctr: 2.4, freq: 1.3, rec: 90, conf: 50, ship: 48, del: 26, ref: 12, unr: 8, ret: 2, meta: 110 },
      { spend: 105_000, cpm: 820, ctr: 2.3, freq: 1.4, rec: 92, conf: 51, ship: 50, del: 27, ref: 13, unr: 8, ret: 2, meta: 112 }
    ]).map((p) => ({ ...p, fixedCosts: 12_000 }))
  ];
  return { version: 1, products: [a, b, c], periods };
}
