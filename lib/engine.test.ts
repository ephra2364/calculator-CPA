import { describe, it, expect } from 'vitest';
import { analyze, runModel, deadzone, diagnose, scaling, simulate, unitCost, deliveryAnalysis, marginBreakdown, rankProduct, aggregate, NO_OPT } from './engine';
import { emptyPeriod, emptyProduct } from './factory';
import type { Period, Product } from './types';

// Produit de référence (calculs vérifiés à la main dans les commentaires)
function product(over: Partial<Product> = {}): Product {
  return emptyProduct({
    id: 'p1', name: 'Montre', price: 15000, costMode: 'import',
    // (3 000 000 + 500 000 + 300 000 + 200 000 + 0) / 1000 = 4 000 FCFA par unité
    importCosts: { purchaseTotal: 3_000_000, transport: 500_000, customs: 300_000, transit: 200_000, other: 0, quantity: 1000 },
    unitCostDirect: 999_999, // ignoré en mode import : jamais additionné
    closingCost: 500, closingScope: 'confirmed', deliverySuccessCost: 1500, deliveryFailCost: 1000, returnCost: 0,
    otherVariableCost: 0, lostRatePct: 0, targetCpa: 3000,
    ...over
  });
}
function period(over: Partial<Period> & { o?: Partial<Period['orders']>; m?: Partial<Period['meta']> } = {}): Period {
  const { o, m, ...rest } = over;
  const p = emptyPeriod('p1', { start: '2026-10-01', end: '2026-10-07', adSpend: 200_000, ...rest });
  p.orders = { ...p.orders, received: 100, confirmed: 80, shipped: 80, delivered: 64, refused: 16, ...o };
  p.meta = { ...p.meta, ...m };
  return p;
}

describe('coût unitaire', () => {
  it('méthode importation, sans additionner le coût direct', () => {
    expect(unitCost(product()).value).toBe(4000);
  });
  it('méthode coût direct', () => {
    expect(unitCost(product({ costMode: 'unit', unitCostDirect: 3500 })).value).toBe(3500);
  });
  it('quantité nulle : pas de division par zéro', () => {
    const u = unitCost(product({ importCosts: { purchaseTotal: 100, transport: null, customs: null, transit: null, other: null, quantity: 0 } }));
    expect(u.value).toBeNull();
  });
});

describe('CAS 1 — produit rentable, CPA sous l’objectif', () => {
  const a = analyze(product(), [period()]);
  it('CPA', () => {
    expect(a.cpa.cpaOrder).toBe(2000); // 200 000 / 100
    expect(a.cpa.cpaConfirmed).toBe(2500); // 200 000 / 80
    expect(a.cpa.cpaDelivered).toBe(3125); // 200 000 / 64
    expect(a.cpa.confirmationRate).toBe(80);
    expect(a.cpa.deliveryRate).toBe(80);
    expect(a.cpa.refusalRate).toBe(20);
    expect(a.cpa.targetGap).toBe(1000);
    expect(a.cpa.targetStatus).toBe('under');
  });
  it('rentabilité', () => {
    const p = a.profit!;
    expect(p.revenue).toBe(960_000); // 64 × 15 000 (livrées uniquement)
    expect(p.cogs).toBe(256_000); // 64 × 4 000
    expect(p.closing).toBe(40_000); // 80 confirmées × 500
    expect(p.deliverySuccess).toBe(96_000); // 64 × 1 500
    expect(p.failedCosts).toBe(16_000); // 16 échecs × 1 000
    expect(p.contribution).toBe(352_000);
    expect(p.netMarginPct).toBeCloseTo(36.667, 2);
    expect(p.profitPerDelivery).toBe(5500);
  });
  it('CPA break-even distinct du CPA cible', () => {
    // 0,8×1×0,8×(15000−4000−1500) − 0,8×0,2×1000 − 0,8×500 = 6080 − 160 − 400 = 5520
    expect(a.breakEven!.perOrder).toBeCloseTo(5520, 6);
    expect(a.breakEven!.perDelivered).toBeCloseTo(8625, 6);
    expect(a.breakEven!.perOrder).not.toBe(a.cpa.targetCpa);
  });
  it('le modèle des simulateurs reproduit exactement le bénéfice réel', () => {
    expect(runModel(a.model!).net).toBeCloseTo(a.profit!.net, 6);
    // identité : bénéfice = commandes × (CPA break-even − CPA)
    expect(100 * (a.breakEven!.perOrder - 2000)).toBeCloseTo(a.profit!.contribution, 6);
  });
});

describe('CAS 2 — rentable mais CPA au-dessus de l’objectif', () => {
  const a = analyze(product({ targetCpa: 1500 }), [period()]);
  it('statut', () => {
    expect(a.cpa.targetStatus).toBe('over');
    expect(a.cpa.targetGap).toBe(-500);
    expect(a.profit!.net).toBeGreaterThan(0);
    const d = diagnose(a);
    expect(d.profitable).toBe(true);
    expect(d.problems.some((x) => x.key === 'acquisition')).toBe(true);
  });
});

describe('CAS 3 — produit déficitaire', () => {
  const a = analyze(product(), [period({ adSpend: 700_000 })]);
  it('perte', () => {
    expect(a.profit!.contribution).toBe(-148_000); // 352 000 − 500 000 de pub en plus
    expect(a.cpa.cpaOrder).toBeGreaterThan(a.breakEven!.perOrder);
    expect(diagnose(a).profitable).toBe(false);
  });
});

describe('CAS 4 — CPA Meta faible mais livraison très faible', () => {
  const p = product({ returnCost: 500, lostRatePct: 20 });
  const a = analyze(p, [period({ adSpend: 100_000, o: { delivered: 32, refused: 48 } })]);
  it('coûts des échecs : transport + retour + 20 % de produits perdus', () => {
    // 48 × 1000 + 48 × 500 + 48 × 0,2 × 4000 = 48 000 + 24 000 + 38 400
    expect(a.profit!.failedCosts).toBeCloseTo(110_400, 6);
    expect(a.profit!.lostProducts).toBeCloseTo(38_400, 6);
    expect(a.profit!.contribution).toBeCloseTo(53_600, 6);
  });
  it('diagnostic : livraison, pas Meta', () => {
    const d = diagnose(a);
    expect(d.main!.key).toBe('delivery');
    expect(d.problems.some((x) => x.key === 'acquisition')).toBe(false);
    const dl = deliveryAnalysis(a);
    expect(dl.origin).toMatch(/organisation de la livraison/);
  });
});

describe('CAS 5 — CPA élevé mais excellente marge', () => {
  const p = product({ price: 30000, costMode: 'unit', unitCostDirect: 5000, targetCpa: 4000 });
  const a = analyze(p, [period({ adSpend: 600_000 })]);
  it('rentable malgré un CPA au-dessus de l’objectif', () => {
    expect(a.cpa.cpaOrder).toBe(6000);
    expect(a.profit!.net).toBeGreaterThan(0);
    const d = diagnose(a);
    expect(d.profitable).toBe(true);
    expect(d.main!.key).toBe('acquisition');
  });
});

// Trois semaines consécutives pour la détection de deadzone
function weeks(w2: Partial<Period['orders']> & { spend?: number; cpm: number; ctr: number },
  w1: Partial<Period['orders']> & { spend?: number; cpm: number; ctr: number },
  w0: Partial<Period['orders']> & { spend?: number; cpm: number; ctr: number }): Period[] {
  const mk = (start: string, end: string, x: typeof w0) => {
    const { spend = 140_000, cpm, ctr, ...o } = x;
    const impressions = (spend / cpm) * 1000;
    return period({ start, end, adSpend: spend, o: { refused: 0, ...o }, m: { impressions, linkClicks: (impressions * ctr) / 100, frequency: 1.5 } });
  };
  return [mk('2026-10-11', '2026-10-17', w2), mk('2026-10-18', '2026-10-24', w1), mk('2026-10-25', '2026-10-31', w0)];
}

describe('CAS 6 — CPM en hausse et CTR en baisse sur plusieurs périodes', () => {
  const ps = weeks(
    { cpm: 1000, ctr: 2, received: 70, confirmed: 56, shipped: 56, delivered: 45 },
    { cpm: 1200, ctr: 1.7, received: 60, confirmed: 48, shipped: 48, delivered: 38 },
    { cpm: 1450, ctr: 1.4, received: 50, confirmed: 40, shipped: 40, delivered: 32 });
  const dz = deadzone(product(), ps, 7, '2026-10-31');
  it('fatigue publicitaire détectée, persistante', () => {
    expect(dz.status).toBe('orange'); // dégradations mais produit encore rentable
    const fatigue = dz.causes.find((c) => c.key === 'fatigue');
    expect(fatigue).toBeTruthy();
    expect(fatigue!.evidence).toMatch(/plusieurs périodes/);
    expect(dz.trends.find((t) => t.key === 'cpm')!.persistent).toBe(true);
    expect(dz.trends.find((t) => t.key === 'ctr')!.persistent).toBe(true);
    expect(dz.trends.find((t) => t.key === 'cpm')!.change).toBeCloseTo(20.833, 2);
  });
  it('le diagnostic business signale la dégradation même si la moyenne est bonne', () => {
    const a = analyze(product(), ps);
    expect(a.cpa.targetStatus).toBe('under');
    const d = diagnose(a, dz);
    expect(d.main!.key).toBe('trend');
    expect(d.main!.category).toBe('Meta Ads');
    expect(d.priorities[0]).toMatch(/créatives/);
    expect(d.headline).toMatch(/se dégradent/);
  });
});

describe('CAS 7 — bonne acquisition, coûts opérationnels trop élevés', () => {
  const p = product({ closingCost: 2000, deliverySuccessCost: 3000 });
  const a = analyze(p, [period({ adSpend: 150_000 })]);
  it('diagnostic : coûts opérationnels', () => {
    const d = diagnose(a);
    expect(a.cpa.targetStatus).toBe('under');
    expect(d.main!.key).toBe('operations');
  });
});

describe('CAS 8 — deadzone probable', () => {
  const ps = weeks(
    { cpm: 1000, ctr: 2, received: 70, confirmed: 56, shipped: 56, delivered: 45 },
    { cpm: 1250, ctr: 1.6, received: 55, confirmed: 44, shipped: 44, delivered: 35 },
    { cpm: 1600, ctr: 1.2, received: 30, confirmed: 24, shipped: 24, delivered: 14 });
  const dz = deadzone(product(), ps, 7, '2026-10-31');
  it('statut rouge', () => {
    expect(dz.status).toBe('rouge');
    expect(dz.windows[0].profitPerDay!).toBeLessThan(0);
  });
});

describe('CAS 9 — données insuffisantes', () => {
  it('une seule période courte → gris', () => {
    const dz = deadzone(product(), [period({ start: '2026-10-29', end: '2026-10-31' })], 7, '2026-10-31');
    expect(dz.status).toBe('gris');
  });
  it('une seule semaine → gris (pas de comparaison possible)', () => {
    const dz = deadzone(product(), [period({ start: '2026-10-25', end: '2026-10-31' })], 7, '2026-10-31');
    expect(dz.status).toBe('gris');
  });
  it('jamais sur moins de 7 jours', () => {
    const ps = weeks({ cpm: 1000, ctr: 2, received: 70 }, { cpm: 1000, ctr: 2, received: 70 }, { cpm: 3000, ctr: 0.5, received: 5 });
    expect(deadzone(product(), ps, 3, '2026-10-31').status).toBe('gris');
  });
  it('aucune commande : pas de NaN', () => {
    const a = analyze(product(), []);
    expect(a.cpa.cpaOrder).toBeNull();
    expect(a.profit).toBeNull();
    expect(diagnose(a).ready).toBe(false);
  });
});

describe('CAS 10 — budget augmenté avec stock insuffisant', () => {
  const a = analyze(product(), [period()]);
  const s = scaling(a.model!, { currentDailyBudget: 28_571, newDailyBudget: 100_000, days: 7, forecastCpa: 2500, forecastDeliveryPct: 80, stockAvailable: 100, cashAvailable: 500_000 });
  it('commandes, stock et trésorerie', () => {
    expect(s.spend).toBe(700_000);
    expect(s.received).toBe(280); // 700 000 / 2 500
    expect(s.shipped).toBeCloseTo(224, 6); // 280 × 0,8 × 1
    expect(s.delivered).toBeCloseTo(179.2, 6);
    expect(s.stockNeed).toBe(224);
    expect(s.missingStock).toBe(124);
    expect(s.stockAlert).toBe(true);
    expect(s.cashAlert).toBe(true);
    expect(s.warnings.join(' ')).toMatch(/pas une garantie/);
  });
});

describe('règles de fiabilité', () => {
  it('achats Meta ≠ livraisons encaissées', () => {
    const a = analyze(product(), [period({ m: { metaPurchases: 150 } })]);
    expect(a.profit!.revenue).toBe(64 * 15000);
  });
  it('closing sur toutes les commandes', () => {
    const a = analyze(product({ closingScope: 'all' }), [period()]);
    expect(a.profit!.closing).toBe(100 * 500);
    expect(runModel(a.model!).net).toBeCloseTo(a.profit!.net, 6);
  });
  it('charges fixes séparées de la marge contributive', () => {
    const a = analyze(product(), [period({ fixedCosts: 100_000 })]);
    expect(a.profit!.contribution).toBe(352_000);
    expect(a.profit!.net).toBe(252_000);
    expect(a.profit!.breakEvenDeliveries).toBeCloseTo(100_000 / 5500, 6);
  });
  it('frais de période (surcharge) utilisés au lieu des frais du produit', () => {
    const a = analyze(product(), [period({ deliverySuccessCostOverride: 2000 })]);
    expect(a.profit!.deliverySuccess).toBe(64 * 2000);
    expect(runModel(a.model!).net).toBeCloseTo(a.profit!.net, 6);
  });
  it('prorata des périodes dans une fenêtre', () => {
    const t = aggregate(product(), [period({ start: '2026-10-01', end: '2026-10-10', adSpend: 100_000, o: { received: 50 } })], { start: '2026-10-06', end: '2026-10-10' });
    expect(t.adSpend).toBe(50_000);
    expect(t.received).toBe(25);
  });
  it('simulation : même volume, impact cohérent', () => {
    const a = analyze(product(), [period()]);
    const none = simulate(a.model!, NO_OPT);
    expect(none.impact).toBeCloseTo(0, 6);
    const s = simulate(a.model!, { ...NO_OPT, cpaReductionPct: 10 });
    expect(s.optimized.received).toBe(100);
    expect(s.impact).toBeCloseTo(20_000, 6); // 10 % de 200 000
    const price = simulate(a.model!, { ...NO_OPT, priceIncreasePct: 10 });
    expect(price.impact).toBeCloseTo(64 * 1500, 6);
    const del = simulate(a.model!, { ...NO_OPT, deliveryPts: 10 });
    // +8 livraisons × (15000−4000−1500) − (−8 échecs × 1000) = 76 000 + 8 000
    expect(del.impact).toBeCloseTo(84_000, 6);
  });
  it('analyse de marge : la somme des parts + bénéfice = prix', () => {
    const a = analyze(product(), [period({ fixedCosts: 64_000 })]);
    const mb = marginBreakdown(a)!;
    const sum = mb.slices.reduce((s, x) => s + x.perDelivery, 0) + mb.profitPerDelivery;
    expect(sum).toBeCloseTo(15000, 6);
  });
  it('classement', () => {
    const a = analyze(product(), [period({ adSpend: 700_000 })]);
    expect(rankProduct(a, deadzone(product(), [], 7))).toBe('deficitaires');
  });
});
