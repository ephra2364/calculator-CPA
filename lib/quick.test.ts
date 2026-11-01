import { describe, it, expect } from 'vitest';
import { quick, evolution, finalVerdict, monthPlan } from './quick';
import { emptyPeriod, emptyProduct } from './factory';

const prod = emptyProduct({ id: 'q', name: 'Test', price: 15000, costMode: 'piece', pieceCost: 3000, importPerPiece: 1000, deliverySuccessCost: 1500 });
const entry = (spend: number, meta: number | null, orders: number, delivered: number, start = '2026-11-01', end = '2026-11-01') => {
  const p = emptyPeriod('q', { start, end, adSpend: spend });
  p.meta.metaPurchases = meta; p.orders.received = orders; p.orders.delivered = delivered;
  return p;
};

describe('calcul rapide', () => {
  it('journée rentable → scaler', () => {
    const q = quick(prod, entry(50_000, 30, 25, 20));
    expect(q.marginPerPiece).toBe(9500); // 15000 − 3000 − 1000 − 1500
    expect(q.profit).toBe(140_000); // 20 × 9500 − 50 000
    expect(q.cpaOrder).toBe(2000);
    expect(q.cpaDelivered).toBe(2500);
    expect(q.cpaMeta).toBeCloseTo(1666.67, 1);
    expect(q.deliveryRate).toBe(80);
    expect(q.maxCpaDelivered).toBeCloseTo(9500, 6);
    expect(q.metaGapPct).toBeCloseTo(20, 6);
    expect(q.verdict).toBe('scaler');
  });
  it('pub trop chère → pas rentable', () => {
    const q = quick(prod, entry(250_000, 30, 25, 20));
    expect(q.profit).toBe(-60_000);
    expect(q.verdict).toBe('pas-rentable');
    expect(q.reason).toMatch(/12\s500 FCFA par pièce livrée/);
  });
  it('rentable mais livraison faible → maintenir', () => {
    const q = quick(prod, entry(50_000, 30, 25, 10));
    expect(q.profit).toBe(45_000);
    expect(q.verdict).toBe('maintenir');
  });
  it('période de 7 jours : bénéfice par jour', () => {
    const q = quick(prod, entry(350_000, null, 175, 140, '2026-10-25', '2026-10-31'));
    expect(q.days).toBe(7);
    expect(q.profitPerDay).toBeCloseTo((140 * 9500 - 350_000) / 7, 6);
  });
  it('données incomplètes', () => {
    const q = quick(prod, entry(50_000, 30, 25, 20));
    expect(quick({ ...prod, price: null }, entry(50_000, 30, 25, 20)).verdict).toBe('incomplet');
    expect(q.verdict).not.toBe('incomplet');
  });
  it('dégradation → scaler devient maintenir', () => {
    const prev = quick(prod, entry(50_000, 30, 25, 20));
    const cur = quick(prod, entry(50_000, 30, 20, 16));
    const ev = evolution(cur, prev)!;
    expect(ev.cpaOrder).toBeCloseTo(25, 6);
    expect(ev.worse).toBe(true);
    expect(cur.verdict).toBe('scaler');
    expect(finalVerdict(cur, ev).verdict).toBe('maintenir');
  });
});

describe('bénéfice réel par pièce, objectif de marge, objectif du mois', () => {
  it('bénéfice net par pièce et décomposition', () => {
    const q = quick(prod, entry(50_000, 30, 25, 20));
    expect(q.profitPerPiece).toBe(7000); // 140 000 / 20
    const pc = q.piece!;
    expect(pc.ads).toBe(2500);
    expect(pc.piece + pc.importCost + pc.delivery + pc.other + pc.ads + pc.failed + pc.profit).toBeCloseTo(15000, 6);
  });
  it('objectif de marge nette', () => {
    const q50 = quick({ ...prod, targetMarginPct: 50 }, entry(50_000, 30, 25, 20));
    expect(q50.marginPct).toBeCloseTo(46.667, 2); // 140 000 / 300 000
    expect(q50.verdict).toBe('maintenir');
    expect(q50.maxCpaForTarget).toBeCloseTo(2000, 6); // 9 500 − 50 % × 15 000
    expect(quick({ ...prod, targetMarginPct: 40 }, entry(50_000, 30, 25, 20)).verdict).toBe('scaler');
  });
  it('objectif du mois et estimation', () => {
    const p = { ...prod, monthlyProfitTarget: 2_000_000 };
    const es = [entry(50_000, 30, 25, 20, '2026-11-01', '2026-11-01'), entry(250_000, 30, 25, 20, '2026-11-02', '2026-11-02')];
    const m = monthPlan(p, es, '2026-11-10');
    expect(m.daysInMonth).toBe(30);
    expect(m.profitSoFar).toBe(80_000); // 140 000 − 60 000
    expect(m.avgProfitPerDay).toBe(40_000);
    expect(m.projection).toBe(80_000 + 40_000 * 28);
    expect(m.status).toBe('en-retard');
    expect(m.neededPerDay).toBeCloseTo((2_000_000 - 80_000) / 28, 6);
    expect(m.deliveriesPerDay).toBeCloseTo(m.neededPerDay! / 2000, 6); // 80 000 / 40 livrées
    expect(m.ordersPerDay).toBeCloseTo(m.deliveriesPerDay! / 0.8, 6);
    expect(m.adBudgetPerDay).toBeCloseTo(m.deliveriesPerDay! * 7500, 6); // 300 000 / 40
  });
  it('période à cheval sur deux mois : prorata', () => {
    const es = [entry(70_000, null, 35, 28, '2026-10-29', '2026-11-04')];
    const m = monthPlan(prod, es, '2026-11-05');
    const total = 28 * 9500 - 70_000;
    expect(m.profitSoFar).toBeCloseTo((total * 4) / 7, 6);
    expect(m.status).toBe('sans-objectif');
  });
});
