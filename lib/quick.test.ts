import { describe, it, expect } from 'vitest';
import { quick, evolution, finalVerdict } from './quick';
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
    expect(q.reason).toMatch(/12\s500 FCFA par livraison/);
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
