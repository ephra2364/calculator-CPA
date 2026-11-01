// =====================================================================
// CPA CALCULATOR — moteur de calcul (indépendant de l'interface)
// Règles : jamais de division par zéro (résultat `null`), commandes ≠ livraisons,
// achats Meta ≠ livraisons encaissées, aucun coût compté deux fois,
// charges fixes séparées de la marge contributive, pertes définitives séparées
// des produits récupérables, hypothèses toujours listées.
// =====================================================================
import type { Num, Period, Product } from './types';

// ---------------------------------------------------------------- outils
export function div(a: Num, b: Num): number | null {
  if (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0) return null;
  return a / b;
}
const z = (x: Num) => (x == null || !isFinite(x) ? 0 : x);
const has = (x: Num): x is number => x != null && isFinite(x);
export function pct(a: Num, b: Num): number | null {
  const r = div(a, b);
  return r == null ? null : r * 100;
}
/** Variation relative (b → a), en %. */
export function change(a: Num, b: Num): number | null {
  if (!has(a) || !has(b) || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}
const DAY = 86400000;
export function parseDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function fmtDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
export function daysInclusive(start: string, end: string): number {
  return Math.max(0, Math.round((parseDay(end) - parseDay(start)) / DAY) + 1);
}

// ---------------------------------------------------------------- coût unitaire
export interface UnitCost {
  value: number | null;
  method: 'import' | 'unit';
  importTotal: number | null;
  note: string;
}
export function unitCost(p: Product): UnitCost {
  if (p.costMode === 'unit') {
    return { value: has(p.unitCostDirect) ? p.unitCostDirect : null, method: 'unit', importTotal: null, note: 'Coût unitaire saisi directement.' };
  }
  const c = p.importCosts;
  const anyCost = [c.purchaseTotal, c.transport, c.customs, c.transit, c.other].some(has);
  const total = anyCost ? z(c.purchaseTotal) + z(c.transport) + z(c.customs) + z(c.transit) + z(c.other) : null;
  const value = has(c.quantity) && c.quantity > 0 ? div(total, c.quantity) : null;
  return {
    value,
    method: 'import',
    importTotal: total,
    note: 'Coût unitaire = (achat + transport + douane + transit + autres frais) ÷ quantité importée.'
  };
}

// ---------------------------------------------------------------- agrégation des périodes
export interface Totals {
  periods: number;
  days: number;
  coveredDays: number;
  adSpend: number;
  // Meta (ratios calculés uniquement sur les périodes où les deux termes sont connus)
  impressions: number | null;
  cpm: number | null;
  ctrAll: number | null;
  ctrLink: number | null;
  cpcLink: number | null;
  linkClicks: number | null;
  addToCart: number | null;
  initiateCheckout: number | null;
  metaPurchases: number | null;
  metaCpa: number | null;
  roas: number | null;
  frequency: number | null;
  // Commandes
  hasOrders: boolean;
  received: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  failed: number;
  refused: number;
  unreachable: number;
  returned: number;
  cancelled: number;
  // Coûts opérationnels effectivement appliqués (période par période)
  closingTotal: number;
  deliverySuccessTotal: number;
  failedTransportTotal: number;
  fixedCosts: number;
}

interface Acc { sum: number; n: number }
const acc = (): Acc => ({ sum: 0, n: 0 });
const add = (a: Acc, v: number) => { a.sum += v; a.n++; };

/**
 * Additionne des périodes. `window` (optionnel) : seules les journées dans la fenêtre comptent ;
 * une période à cheval est répartie au prorata des jours (hypothèse : activité régulière).
 */
export function aggregate(product: Product, periods: Period[], window?: { start: string; end: string }): Totals {
  const ws = window ? parseDay(window.start) : -Infinity;
  const we = window ? parseDay(window.end) : Infinity;
  const covered = new Set<number>();
  const t: Totals = {
    periods: 0, days: 0, coveredDays: 0, adSpend: 0,
    impressions: null, cpm: null, ctrAll: null, ctrLink: null, cpcLink: null, linkClicks: null,
    addToCart: null, initiateCheckout: null, metaPurchases: null, metaCpa: null, roas: null, frequency: null,
    hasOrders: false, received: 0, confirmed: 0, shipped: 0, delivered: 0, failed: 0, refused: 0,
    unreachable: 0, returned: 0, cancelled: 0,
    closingTotal: 0, deliverySuccessTotal: 0, failedTransportTotal: 0, fixedCosts: 0
  };
  const imp = { spend: 0, imp: 0, n: 0 }, ctrA = { clicks: 0, imp: 0, n: 0 }, ctrL = { clicks: 0, imp: 0, n: 0 };
  const cpc = { spend: 0, clicks: 0, n: 0 }, pur = { spend: 0, p: 0, n: 0 }, roas = { value: 0, spend: 0, n: 0 };
  const freq = { imp: 0, reach: 0, n: 0 };
  const lc = acc(), atc = acc(), ic = acc(), mp = acc(), im = acc();

  for (const p of periods) {
    if (p.productId !== product.id) continue;
    const ps = parseDay(p.start), pe = parseDay(p.end);
    const len = Math.max(1, Math.round((pe - ps) / DAY) + 1);
    const os = Math.max(ps, ws), oe = Math.min(pe, we);
    if (oe < os) continue;
    const ov = Math.round((oe - os) / DAY) + 1;
    const f = ov / len; // fraction de la période dans la fenêtre
    for (let d = os; d <= oe; d += DAY) covered.add(d);
    t.periods++;
    t.days += ov;

    const spend = z(p.adSpend) * f;
    t.adSpend += spend;
    const m = p.meta;
    // Impressions : saisies, sinon déduites du CPM
    let impressions: number | null = has(m.impressions) ? m.impressions * f : null;
    if (impressions == null && has(m.cpm) && m.cpm > 0 && has(p.adSpend)) impressions = (spend / m.cpm) * 1000;
    if (impressions != null) { add(im, impressions); imp.spend += spend; imp.imp += impressions; imp.n++; }
    if (impressions != null && has(m.ctrAll)) { ctrA.clicks += (impressions * m.ctrAll) / 100; ctrA.imp += impressions; ctrA.n++; }
    // Clics sur lien : saisis, sinon déduits du CPC, sinon du CTR lien
    let links: number | null = has(m.linkClicks) ? m.linkClicks * f : null;
    if (links == null && has(m.cpcLink) && m.cpcLink > 0 && has(p.adSpend)) links = spend / m.cpcLink;
    if (links == null && has(m.ctrLink) && impressions != null) links = (impressions * m.ctrLink) / 100;
    if (links != null) {
      add(lc, links);
      cpc.spend += spend; cpc.clicks += links; cpc.n++;
      if (impressions != null) { ctrL.clicks += links; ctrL.imp += impressions; ctrL.n++; }
    }
    if (has(m.addToCart)) add(atc, m.addToCart * f);
    if (has(m.initiateCheckout)) add(ic, m.initiateCheckout * f);
    let purchases: number | null = has(m.metaPurchases) ? m.metaPurchases * f : null;
    if (purchases == null && has(m.metaCpa) && m.metaCpa > 0 && has(p.adSpend)) purchases = spend / m.metaCpa;
    if (purchases != null) { add(mp, purchases); pur.spend += spend; pur.p += purchases; pur.n++; }
    if (has(m.roas)) { roas.value += m.roas * spend; roas.spend += spend; roas.n++; }
    if (has(m.frequency) && m.frequency > 0 && impressions != null) { freq.imp += impressions; freq.reach += impressions / m.frequency; freq.n++; }

    // Commandes
    const o = p.orders;
    if ([o.received, o.confirmed, o.shipped, o.delivered].some(has)) t.hasOrders = true;
    const received = z(o.received) * f, confirmed = z(o.confirmed) * f, delivered = z(o.delivered) * f;
    const refused = z(o.refused) * f, unreachable = z(o.unreachable) * f, returned = z(o.returned) * f;
    // Expédiées : saisies, sinon livrées + échecs connus
    const shipped = has(o.shipped) ? o.shipped * f : delivered + refused + unreachable + returned;
    const failed = Math.max(0, shipped - delivered);
    t.received += received; t.confirmed += confirmed; t.shipped += shipped; t.delivered += delivered; t.failed += failed;
    t.refused += refused; t.unreachable += unreachable; t.returned += returned; t.cancelled += z(o.cancelled) * f;

    // Frais réellement appliqués sur cette période (surcharge de période, sinon frais du produit)
    const closing = has(p.closingCostOverride) ? p.closingCostOverride : z(product.closingCost);
    const delivery = has(p.deliverySuccessCostOverride) ? p.deliverySuccessCostOverride : z(product.deliverySuccessCost);
    const failCost = has(p.deliveryFailCostOverride) ? p.deliveryFailCostOverride : z(product.deliveryFailCost);
    t.closingTotal += closing * (product.closingScope === 'all' ? received : confirmed);
    t.deliverySuccessTotal += delivery * delivered;
    t.failedTransportTotal += failCost * failed;
    t.fixedCosts += z(p.fixedCosts) * f;
  }
  t.coveredDays = covered.size;
  t.impressions = im.n ? im.sum : null;
  t.cpm = imp.n ? div(imp.spend * 1000, imp.imp) : null;
  t.ctrAll = ctrA.n ? pct(ctrA.clicks, ctrA.imp) : null;
  t.ctrLink = ctrL.n ? pct(ctrL.clicks, ctrL.imp) : null;
  t.cpcLink = cpc.n ? div(cpc.spend, cpc.clicks) : null;
  t.linkClicks = lc.n ? lc.sum : null;
  t.addToCart = atc.n ? atc.sum : null;
  t.initiateCheckout = ic.n ? ic.sum : null;
  t.metaPurchases = mp.n ? mp.sum : null;
  t.metaCpa = pur.n ? div(pur.spend, pur.p) : null;
  t.roas = roas.n ? div(roas.value, roas.spend) : null;
  t.frequency = freq.n ? div(freq.imp, freq.reach) : null;
  return t;
}

// ---------------------------------------------------------------- CPA
export interface CpaResult {
  cpaOrder: number | null;
  cpaConfirmed: number | null;
  cpaDelivered: number | null;
  confirmationRate: number | null; // %
  shippingRate: number | null; // % des confirmées
  deliveryRate: number | null; // % des expédiées
  refusalRate: number | null; // % des expédiées
  unreachableRate: number | null;
  returnRate: number | null;
  cancelRate: number | null; // % des reçues
  targetCpa: number | null;
  targetGap: number | null; // CPA cible − CPA actuel (positif = sous l'objectif)
  targetStatus: 'under' | 'over' | 'equal' | null;
}
export function cpaMetrics(p: Product, t: Totals): CpaResult {
  const cpaOrder = div(t.adSpend, t.received);
  const target = has(p.targetCpa) ? p.targetCpa : null;
  const gap = target != null && cpaOrder != null ? target - cpaOrder : null;
  return {
    cpaOrder,
    cpaConfirmed: div(t.adSpend, t.confirmed),
    cpaDelivered: div(t.adSpend, t.delivered),
    confirmationRate: pct(t.confirmed, t.received),
    shippingRate: pct(t.shipped, t.confirmed),
    deliveryRate: pct(t.delivered, t.shipped),
    refusalRate: pct(t.refused, t.shipped),
    unreachableRate: pct(t.unreachable, t.shipped),
    returnRate: pct(t.returned, t.shipped),
    cancelRate: pct(t.cancelled, t.received),
    targetCpa: target,
    targetGap: gap,
    targetStatus: gap == null ? null : Math.abs(gap) < 0.005 ? 'equal' : gap > 0 ? 'under' : 'over'
  };
}

// ---------------------------------------------------------------- modèle économique (par commande reçue)
/** Entrées du modèle : tout est exprimé par commande reçue, taux entre 0 et 1. */
export interface ModelInput {
  received: number;
  confirmRate: number;
  shipRate: number;
  deliveryRate: number;
  cpaOrder: number;
  price: number;
  unitCost: number;
  closingCost: number;
  closingScope: 'all' | 'confirmed';
  deliveryCost: number;
  failCost: number; // transport échoué + retour
  lostRate: number; // part des colis échoués perdus (0..1)
  otherVariable: number; // par livraison réussie
  fixedCosts: number;
}
export interface ModelOutput {
  received: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  failed: number;
  adSpend: number;
  revenue: number;
  cogs: number;
  closing: number;
  delivery: number;
  otherVariable: number;
  failedCosts: number;
  lostProducts: number;
  contribution: number;
  net: number;
  marginPct: number | null; // bénéfice net / CA livré
  contributionMarginPct: number | null;
  cpaOrder: number;
  cpaDelivered: number | null;
  breakEvenCpaOrder: number;
  breakEvenCpaDelivered: number | null;
  ordersForFixedCosts: number | null; // commandes reçues nécessaires pour couvrir les charges fixes
}
export function runModel(m: ModelInput): ModelOutput {
  const c = clamp01(m.confirmRate), s = clamp01(m.shipRate), d = clamp01(m.deliveryRate), lost = clamp01(m.lostRate);
  const confirmed = m.received * c, shipped = confirmed * s, delivered = shipped * d, failed = shipped - delivered;
  const adSpend = m.received * m.cpaOrder;
  const revenue = delivered * m.price, cogs = delivered * m.unitCost;
  const closing = m.closingCost * (m.closingScope === 'all' ? m.received : confirmed);
  const delivery = delivered * m.deliveryCost, otherVariable = delivered * m.otherVariable;
  const lostProducts = failed * lost * m.unitCost;
  const failedCosts = failed * m.failCost + lostProducts;
  const contribution = revenue - cogs - closing - delivery - otherVariable - failedCosts - adSpend;
  const net = contribution - m.fixedCosts;
  const be = breakEvenPerOrder(m);
  const perOrder = m.received > 0 ? contribution / m.received : null;
  return {
    received: m.received, confirmed, shipped, delivered, failed, adSpend, revenue, cogs, closing, delivery, otherVariable,
    failedCosts, lostProducts, contribution, net,
    marginPct: pct(net, revenue), contributionMarginPct: pct(contribution, revenue),
    cpaOrder: m.cpaOrder, cpaDelivered: div(adSpend, delivered),
    breakEvenCpaOrder: be,
    breakEvenCpaDelivered: div(be, c * s * d),
    ordersForFixedCosts: m.fixedCosts <= 0 ? 0 : perOrder != null && perOrder > 0 ? m.fixedCosts / perOrder : null
  };
}
/** CPA maximal par commande reçue avant perte (marge contributive nulle, hors charges fixes). */
export function breakEvenPerOrder(m: Omit<ModelInput, 'received' | 'cpaOrder' | 'fixedCosts'>): number {
  const c = clamp01(m.confirmRate), s = clamp01(m.shipRate), d = clamp01(m.deliveryRate);
  const perDelivered = m.price - m.unitCost - m.deliveryCost - m.otherVariable;
  const perFailed = m.failCost + clamp01(m.lostRate) * m.unitCost;
  const closingPerOrder = m.closingCost * (m.closingScope === 'all' ? 1 : c);
  return c * s * d * perDelivered - c * s * (1 - d) * perFailed - closingPerOrder;
}
function clamp01(x: number) { return Math.min(1, Math.max(0, isFinite(x) ? x : 0)); }

// ---------------------------------------------------------------- analyse complète d'un produit
export type RateSource = 'reel' | 'hypothese' | 'manquant';
export interface Analysis {
  product: Product;
  totals: Totals;
  unit: UnitCost;
  cpa: CpaResult;
  /** Rentabilité réelle de la période (frais réellement appliqués). */
  profit: {
    revenue: number;
    cogs: number;
    closing: number;
    deliverySuccess: number;
    otherVariable: number;
    operating: number;
    failedTransport: number;
    failedReturn: number;
    lostProducts: number;
    failedCosts: number;
    adSpend: number;
    contribution: number;
    fixedCosts: number;
    net: number;
    contributionMarginPct: number | null;
    netMarginPct: number | null;
    profitPerDelivery: number | null;
    breakEvenDeliveries: number | null; // livraisons nécessaires pour couvrir les charges fixes
  } | null;
  rates: { confirm: number | null; ship: number | null; delivery: number | null; source: RateSource };
  breakEven: { perOrder: number; perConfirmed: number | null; perDelivered: number | null } | null;
  model: ModelInput | null; // situation actuelle exprimée pour les simulateurs
  missing: string[];
  assumptions: string[];
}

export function analyze(p: Product, periods: Period[], window?: { start: string; end: string }): Analysis {
  const totals = aggregate(p, periods, window);
  const unit = unitCost(p);
  const cpa = cpaMetrics(p, totals);
  const missing: string[] = [];
  const assumptions: string[] = [unit.note];
  if (!has(p.price)) missing.push('Prix de vente');
  if (unit.value == null) missing.push(p.costMode === 'unit' ? 'Coût unitaire' : 'Coût d’importation et quantité importée');
  if (!has(p.closingCost)) assumptions.push('Frais de closing non renseignés : comptés à 0.');
  if (!has(p.deliverySuccessCost)) assumptions.push('Coût de livraison réussie non renseigné : compté à 0.');
  if (!has(p.deliveryFailCost)) assumptions.push('Coût de livraison échouée non renseigné : compté à 0.');
  assumptions.push(p.closingScope === 'all' ? 'Closing payé sur toutes les commandes reçues.' : 'Closing payé uniquement sur les commandes confirmées.');
  const lost = z(p.lostRatePct) / 100;
  assumptions.push(lost > 0
    ? `${round(lost * 100)} % des colis non livrés sont considérés perdus (coût du produit compté en perte).`
    : 'Les colis non livrés reviennent en stock : leur coût produit n’est pas une perte.');

  // Taux : réels si des commandes sont saisies, sinon hypothèses du produit
  let source: RateSource = 'manquant';
  let confirm: number | null = null, ship: number | null = null, delivery: number | null = null;
  if (totals.hasOrders && totals.received > 0) {
    source = 'reel';
    confirm = div(totals.confirmed, totals.received);
    ship = div(totals.shipped, totals.confirmed);
    delivery = div(totals.delivered, totals.shipped);
  }
  if (confirm == null && has(p.assumedConfirmationPct)) { confirm = p.assumedConfirmationPct / 100; source = 'hypothese'; }
  if (ship == null && has(p.assumedShippingPct)) { ship = p.assumedShippingPct / 100; if (source !== 'reel') source = 'hypothese'; }
  if (delivery == null && has(p.assumedDeliveryPct)) { delivery = p.assumedDeliveryPct / 100; if (source !== 'reel') source = 'hypothese'; }
  if (source === 'hypothese') assumptions.push('Taux de confirmation / expédition / livraison : hypothèses saisies sur le produit (aucun résultat réel).');

  const canPrice = has(p.price) && unit.value != null;
  const failUnit = z(p.deliveryFailCost) + z(p.returnCost);
  let breakEven: Analysis['breakEven'] = null;
  if (canPrice && confirm != null && ship != null && delivery != null) {
    const be = breakEvenPerOrder({
      confirmRate: confirm, shipRate: ship, deliveryRate: delivery, price: p.price as number, unitCost: unit.value as number,
      closingCost: z(p.closingCost), closingScope: p.closingScope, deliveryCost: z(p.deliverySuccessCost),
      failCost: failUnit, lostRate: lost, otherVariable: z(p.otherVariableCost)
    });
    breakEven = { perOrder: be, perConfirmed: div(be, confirm), perDelivered: div(be, confirm * ship * delivery) };
  } else if (canPrice) {
    missing.push('Taux de confirmation et de livraison (résultats réels ou hypothèses) pour le CPA break-even');
  }

  let profit: Analysis['profit'] = null;
  if (canPrice && totals.hasOrders) {
    const price = p.price as number, uc = unit.value as number;
    const revenue = totals.delivered * price; // seules les commandes livrées sont encaissées
    const cogs = totals.delivered * uc;
    const otherVariable = totals.delivered * z(p.otherVariableCost);
    const failedReturn = totals.failed * z(p.returnCost);
    const lostProducts = totals.failed * lost * uc;
    const failedCosts = totals.failedTransportTotal + failedReturn + lostProducts;
    const operating = totals.closingTotal + totals.deliverySuccessTotal + otherVariable;
    const contribution = revenue - cogs - operating - failedCosts - totals.adSpend;
    const net = contribution - totals.fixedCosts;
    const ppd = div(contribution, totals.delivered);
    profit = {
      revenue, cogs, closing: totals.closingTotal, deliverySuccess: totals.deliverySuccessTotal, otherVariable, operating,
      failedTransport: totals.failedTransportTotal, failedReturn, lostProducts, failedCosts, adSpend: totals.adSpend,
      contribution, fixedCosts: totals.fixedCosts, net,
      contributionMarginPct: pct(contribution, revenue), netMarginPct: pct(net, revenue),
      profitPerDelivery: ppd,
      breakEvenDeliveries: totals.fixedCosts <= 0 ? 0 : ppd != null && ppd > 0 ? totals.fixedCosts / ppd : null
    };
  } else if (!totals.hasOrders) {
    missing.push('Résultats commerciaux (au moins une période avec commandes)');
  }

  let model: ModelInput | null = null;
  if (canPrice && confirm != null && ship != null && delivery != null && cpa.cpaOrder != null && totals.received > 0) {
    model = {
      received: totals.received, confirmRate: confirm, shipRate: ship, deliveryRate: delivery, cpaOrder: cpa.cpaOrder,
      price: p.price as number, unitCost: unit.value as number,
      // frais moyens réellement appliqués sur la période (cohérent avec le Profit Analyzer)
      closingCost: z(div(totals.closingTotal, p.closingScope === 'all' ? totals.received : totals.confirmed) ?? p.closingCost),
      closingScope: p.closingScope,
      deliveryCost: z(div(totals.deliverySuccessTotal, totals.delivered) ?? p.deliverySuccessCost),
      failCost: z(div(totals.failedTransportTotal, totals.failed) ?? p.deliveryFailCost) + z(p.returnCost),
      lostRate: lost, otherVariable: z(p.otherVariableCost), fixedCosts: totals.fixedCosts
    };
  }
  if (window) assumptions.push('Périodes à cheval sur la fenêtre réparties au prorata des jours.');
  return { product: p, totals, unit, cpa, profit, rates: { confirm, ship, delivery, source }, breakEven, model, missing, assumptions };
}

export function round(x: number, d = 0) { const k = 10 ** d; return Math.round(x * k) / k; }

// ---------------------------------------------------------------- simulateur d'optimisation
export interface Optimization {
  cpaReductionPct: number; // 0..100
  confirmationPts: number; // points de %
  deliveryPts: number;
  closingReductionPct: number;
  deliveryCostReductionPct: number;
  importReductionPct: number;
  priceIncreasePct: number;
}
export const NO_OPT: Optimization = { cpaReductionPct: 0, confirmationPts: 0, deliveryPts: 0, closingReductionPct: 0, deliveryCostReductionPct: 0, importReductionPct: 0, priceIncreasePct: 0 };
export function applyOptimization(m: ModelInput, o: Optimization): ModelInput {
  return {
    ...m, // même volume de commandes reçues et même période
    cpaOrder: m.cpaOrder * (1 - o.cpaReductionPct / 100),
    confirmRate: Math.min(1, m.confirmRate + o.confirmationPts / 100),
    deliveryRate: Math.min(1, m.deliveryRate + o.deliveryPts / 100),
    closingCost: m.closingCost * (1 - o.closingReductionPct / 100),
    deliveryCost: m.deliveryCost * (1 - o.deliveryCostReductionPct / 100),
    unitCost: m.unitCost * (1 - o.importReductionPct / 100),
    price: m.price * (1 + o.priceIncreasePct / 100)
  };
}
export function simulate(m: ModelInput, o: Optimization) {
  const current = runModel(m);
  const optimized = runModel(applyOptimization(m, o));
  return { current, optimized, impact: optimized.net - current.net };
}

// ---------------------------------------------------------------- simulateur de scaling
export interface ScalingInput {
  currentDailyBudget: number;
  newDailyBudget: number;
  days: number;
  forecastCpa: number;
  forecastDeliveryPct: number;
  stockAvailable: number | null;
  cashAvailable: number | null;
}
export function scaling(m: ModelInput, s: ScalingInput) {
  const spend = s.newDailyBudget * s.days;
  const received = s.forecastCpa > 0 ? spend / s.forecastCpa : 0;
  const out = runModel({ ...m, received, cpaOrder: s.forecastCpa, deliveryRate: s.forecastDeliveryPct / 100, fixedCosts: m.fixedCosts });
  const stockNeed = Math.ceil(out.shipped); // chaque colis expédié doit être en stock au départ
  const missingStock = s.stockAvailable == null ? null : Math.max(0, stockNeed - s.stockAvailable);
  // Paiement à la livraison : la publicité et les frais sont payés avant l'encaissement
  const restock = (missingStock ?? 0) * m.unitCost;
  const cashNeed = out.adSpend + out.closing + out.delivery + out.otherVariable + out.failedCosts + restock;
  const warnings: string[] = [
    'Le CPA augmente souvent quand le budget augmente : ce calcul suppose le CPA prévisionnel saisi, ce n’est pas une garantie.'
  ];
  const ratio = s.currentDailyBudget > 0 ? s.newDailyBudget / s.currentDailyBudget : null;
  if (ratio != null && ratio >= 2) warnings.push(`Budget multiplié par ${round(ratio, 1)} : augmente par paliers (20 à 30 % tous les 2 à 3 jours) et surveille le CPA.`);
  if (missingStock != null && missingStock > 0) warnings.push(`Stock insuffisant : il manque environ ${missingStock} unités pour expédier les commandes estimées.`);
  if (s.cashAvailable != null && s.cashAvailable < cashNeed) warnings.push('Trésorerie insuffisante : les dépenses à avancer dépassent la trésorerie disponible.');
  if (out.contribution < 0) warnings.push('Avec ces hypothèses, le scaling serait déficitaire.');
  return { ...out, spend, stockNeed, missingStock, restock, cashNeed, ratio, warnings,
    stockAlert: missingStock != null && missingStock > 0,
    cashAlert: s.cashAvailable != null && s.cashAvailable < cashNeed };
}

// ---------------------------------------------------------------- analyse de livraison
export const BENCH = {
  confirmationLow: 65, confirmationTarget: 75,
  deliveryLow: 75, deliveryTarget: 80,
  importSharePct: 35,
  opsSharePct: 20,
  linkCtrLow: 1,
  unreachableHigh: 10, refusalHigh: 10, cancelHigh: 10
};
export interface DeliveryDiag { level: 'ok' | 'warn' | 'bad'; title: string; text: string; actions: string[] }
export function deliveryAnalysis(a: Analysis) {
  const t = a.totals, c = a.cpa;
  const p = a.profit;
  const avgDeliveryCost = p ? div(p.closing + p.deliverySuccess + p.failedCosts, t.delivered) : null;
  const avgFailedCost = p ? div(p.failedCosts, t.failed) : null;
  const diags: DeliveryDiag[] = [];
  if (!t.hasOrders || t.received <= 0) return { avgDeliveryCost, avgFailedCost, diags, origin: null as string | null };
  const conf = c.confirmationRate, del = c.deliveryRate;
  if (conf != null && conf < BENCH.confirmationLow) diags.push({ level: 'bad', title: `Taux de confirmation faible (${round(conf)} %)`,
    text: 'Une grande partie des commandes reçues n’est pas confirmée.',
    actions: ['Améliore ton script de closing', 'Rappelle les clients plus vite (idéalement en moins d’une heure)', 'Qualifie mieux les prospects (formulaire, prix affiché)', 'Vérifie les numéros et coordonnées dès la commande'] });
  if (del != null && del < BENCH.deliveryLow) diags.push({ level: 'bad', title: `Taux de livraison faible (${round(del)} %)`,
    text: 'Trop de colis expédiés ne sont pas livrés.',
    actions: ['Vérifie les adresses avant expédition', 'Améliore le suivi client (message la veille et le jour J)', 'Réduis les délais entre confirmation et livraison', 'Coordonne-toi mieux avec les livreurs', 'Confirme les commandes de façon plus rigoureuse'] });
  // Origine probable : qualité des prospects ou organisation de la livraison
  let origin: string | null = null;
  const unreach = c.unreachableRate ?? 0, refus = c.refusalRate ?? 0;
  if (conf != null && conf < BENCH.confirmationLow && (del == null || del >= BENCH.deliveryLow)) {
    origin = 'Le problème se situe surtout avant l’expédition : les prospects générés semblent peu qualifiés ou le closing est insuffisant. Vérifie le ciblage, la clarté de l’offre (prix affiché) et ton process d’appel.';
  } else if (conf != null && conf >= BENCH.confirmationLow && del != null && del < BENCH.deliveryLow) {
    origin = 'Les commandes sont bien confirmées mais se perdent à la livraison : le problème vient plutôt de l’organisation de la livraison (délais, suivi, livreurs, adresses) que de Meta.';
  } else if (conf != null && del != null && conf < BENCH.confirmationLow && del < BENCH.deliveryLow) {
    origin = 'La confirmation ET la livraison sont faibles : la qualité des prospects est probablement en cause, mais vérifie aussi tes délais de livraison.';
  }
  if (unreach >= BENCH.unreachableHigh) diags.push({ level: 'warn', title: `Clients injoignables : ${round(unreach)} % des expéditions`, text: 'Beaucoup de clients ne répondent pas au moment de la livraison.', actions: ['Préviens le client la veille et le matin de la livraison', 'Demande un second numéro à la confirmation'] });
  if (refus >= BENCH.refusalHigh) diags.push({ level: 'warn', title: `Refus à la livraison : ${round(refus)} % des expéditions`, text: 'Des clients refusent le colis à la porte.', actions: ['Vérifie que la promesse publicitaire correspond au produit', 'Rappelle le prix total (frais inclus) à la confirmation', 'Raccourcis le délai de livraison'] });
  if ((c.cancelRate ?? 0) >= BENCH.cancelHigh) diags.push({ level: 'warn', title: `Annulations : ${round(c.cancelRate as number)} % des commandes`, text: 'Des commandes sont annulées avant expédition.', actions: ['Identifie les motifs d’annulation lors des appels'] });
  if (!diags.length) diags.push({ level: 'ok', title: 'Confirmation et livraison correctes', text: 'Aucun problème majeur détecté sur la chaîne commande → livraison.', actions: [] });
  return { avgDeliveryCost, avgFailedCost, diags, origin };
}

// ---------------------------------------------------------------- analyse de marge
export interface MarginSlice { key: string; label: string; perDelivery: number; pctOfPrice: number }
export function marginBreakdown(a: Analysis): { slices: MarginSlice[]; profitPerDelivery: number; price: number } | null {
  const p = a.profit, t = a.totals;
  if (!p || t.delivered <= 0 || !has(a.product.price)) return null;
  const price = a.product.price;
  const d = t.delivered;
  const items: [string, string, number][] = [
    ['import', 'Coût d’importation', p.cogs / d],
    ['closing', 'Closing', p.closing / d],
    ['delivery', 'Livraison', (p.deliverySuccess + p.otherVariable) / d],
    ['failed', 'Commandes échouées', p.failedCosts / d],
    ['ads', 'Publicité', p.adSpend / d],
    ['fixed', 'Frais fixes', p.fixedCosts / d]
  ];
  const slices = items.map(([key, label, v]) => ({ key, label, perDelivery: v, pctOfPrice: (v / price) * 100 }));
  return { slices, profitPerDelivery: p.net / d, price };
}

// ---------------------------------------------------------------- deadzone
export type Status = 'vert' | 'orange' | 'rouge' | 'gris';
export interface WindowMetrics {
  start: string; end: string; days: number; coveredDays: number; valid: boolean;
  spend: number; cpm: number | null; ctr: number | null; cpc: number | null; frequency: number | null;
  cpa: number | null; metaCpa: number | null; ordersPerDay: number | null; conversion: number | null;
  profitPerDay: number | null; deliveryRate: number | null;
}
export interface MetricTrend { key: string; label: string; recent: number | null; previous: number | null; older: number | null;
  change: number | null; changeOlder: number | null; degraded: boolean; persistent: boolean; worseWhen: 'up' | 'down' }
export interface DeadzoneResult {
  status: Status; title: string; summary: string;
  windows: WindowMetrics[]; trends: MetricTrend[]; causes: { key: string; label: string; evidence: string; action: string }[];
  windowDays: number;
}

function windowMetrics(p: Product, periods: Period[], start: string, end: string): WindowMetrics {
  const a = analyze(p, periods, { start, end });
  const t = a.totals;
  const days = daysInclusive(start, end);
  const valid = t.coveredDays >= Math.ceil(days * 0.7) && t.adSpend > 0;
  const conversion = t.linkClicks && t.linkClicks > 0
    ? (t.hasOrders && t.received > 0 ? pct(t.received, t.linkClicks) : pct(t.metaPurchases, t.linkClicks)) : null;
  return {
    start, end, days, coveredDays: t.coveredDays, valid, spend: t.adSpend, cpm: t.cpm, ctr: t.ctrLink ?? t.ctrAll,
    cpc: t.cpcLink, frequency: t.frequency,
    cpa: t.hasOrders && t.received > 0 ? a.cpa.cpaOrder : t.metaCpa, metaCpa: t.metaCpa,
    ordersPerDay: t.hasOrders ? div(t.received, t.coveredDays) : div(t.metaPurchases, t.coveredDays),
    conversion,
    profitPerDay: a.profit ? div(a.profit.contribution, t.coveredDays) : null,
    deliveryRate: a.cpa.deliveryRate
  };
}

const TREND_DEFS: { key: keyof WindowMetrics; label: string; worseWhen: 'up' | 'down'; threshold: number }[] = [
  { key: 'cpm', label: 'CPM', worseWhen: 'up', threshold: 15 },
  { key: 'ctr', label: 'CTR (lien)', worseWhen: 'down', threshold: 10 },
  { key: 'cpc', label: 'CPC (lien)', worseWhen: 'up', threshold: 15 },
  { key: 'frequency', label: 'Fréquence', worseWhen: 'up', threshold: 15 },
  { key: 'cpa', label: 'CPA', worseWhen: 'up', threshold: 15 },
  { key: 'ordersPerDay', label: 'Commandes / jour', worseWhen: 'down', threshold: 20 },
  { key: 'conversion', label: 'Taux de conversion', worseWhen: 'down', threshold: 15 },
  { key: 'profitPerDay', label: 'Bénéfice / jour', worseWhen: 'down', threshold: 20 }
];

function isWorse(recent: number | null, prev: number | null, worseWhen: 'up' | 'down', threshold: number, key: string): { ch: number | null; worse: boolean } {
  if (recent == null || prev == null) return { ch: null, worse: false };
  if (key === 'profitPerDay') {
    // bénéfice : dégradation si baisse de plus de 20 % ou passage en perte
    const ch = change(recent, prev);
    const worse = (prev > 0 && recent <= 0) || (ch != null && ch <= -threshold) || (prev <= 0 && recent < prev);
    return { ch, worse };
  }
  const ch = change(recent, prev);
  if (ch == null) return { ch, worse: false };
  return { ch, worse: worseWhen === 'up' ? ch >= threshold : ch <= -threshold };
}

/** `endDate` = dernier jour analysé ; trois fenêtres consécutives de `windowDays` jours. */
export function deadzone(p: Product, periods: Period[], windowDays: number, endDate?: string, custom?: { start: string; end: string; compareStart: string; compareEnd: string }): DeadzoneResult {
  const mine = periods.filter((x) => x.productId === p.id);
  let wins: { start: string; end: string }[];
  if (custom) {
    wins = [{ start: custom.start, end: custom.end }, { start: custom.compareStart, end: custom.compareEnd }];
    windowDays = daysInclusive(custom.start, custom.end);
  } else {
    const last = endDate ? parseDay(endDate) : mine.length ? Math.max(...mine.map((x) => parseDay(x.end))) : Date.now();
    wins = [0, 1, 2].map((i) => {
      const e = last - i * windowDays * DAY;
      return { start: fmtDay(e - (windowDays - 1) * DAY), end: fmtDay(e) };
    });
  }
  const windows = wins.map((w) => windowMetrics(p, periods, w.start, w.end));
  const [w0, w1, w2] = windows;
  const trends: MetricTrend[] = TREND_DEFS.map((d) => {
    const r = w0.valid ? (w0[d.key] as number | null) : null;
    const pv = w1 && w1.valid ? (w1[d.key] as number | null) : null;
    const ol = w2 && w2.valid ? (w2[d.key] as number | null) : null;
    const a = isWorse(r, pv, d.worseWhen, d.threshold, d.key as string);
    const b = isWorse(pv, ol, d.worseWhen, d.threshold, d.key as string);
    return { key: d.key as string, label: d.label, recent: r, previous: pv, older: ol, change: a.ch, changeOlder: b.ch,
      degraded: a.worse, persistent: a.worse && b.worse, worseWhen: d.worseWhen };
  });

  const base = { windows, trends, windowDays };
  if (windowDays < 7) {
    return { ...base, status: 'gris', title: 'Données insuffisantes', causes: [],
      summary: 'Analyse impossible sur moins de 7 jours : une deadzone ne se déclare jamais sur une ou quelques journées.' };
  }
  if (!w0.valid || !w1 || !w1.valid) {
    return { ...base, status: 'gris', title: 'Données insuffisantes', causes: [],
      summary: `Il faut au moins deux fenêtres de ${windowDays} jours couvertes à 70 % avec des dépenses publicitaires (actuellement : ${w0.coveredDays} j et ${w1 ? w1.coveredDays : 0} j).` };
  }

  const tr = (k: string) => trends.find((x) => x.key === k) as MetricTrend;
  const degraded = trends.filter((x) => x.degraded);
  const persistent = trends.filter((x) => x.persistent);
  const profitNow = w0.profitPerDay;
  const lossNow = profitNow != null && profitNow < 0;
  const ordersDrop = tr('ordersPerDay').change != null && (tr('ordersPerDay').change as number) <= -30;
  const profitDrop = tr('profitPerDay').degraded && (tr('profitPerDay').change == null || (tr('profitPerDay').change as number) <= -50 || lossNow);

  // Causes (distinctes)
  const causes: DeadzoneResult['causes'] = [];
  const cpmUp = tr('cpm').degraded, ctrDown = tr('ctr').degraded, cpaUp = tr('cpa').degraded;
  const cpmStable = tr('cpm').change != null && Math.abs(tr('cpm').change as number) < 15;
  const ctrStable = tr('ctr').change != null && !ctrDown;
  if (cpmUp && ctrDown && cpaUp) causes.push({ key: 'fatigue', label: 'Fatigue publicitaire ou hausse de la concurrence',
    evidence: `CPM ${sign(tr('cpm').change)} %, CTR ${sign(tr('ctr').change)} %, CPA ${sign(tr('cpa').change)} %${tr('cpm').persistent && tr('ctr').persistent ? ' sur plusieurs périodes' : ' (à confirmer sur la période suivante)'}.`,
    action: 'Renouvelle tes créatives et teste de nouveaux angles ; élargis ou change d’audience.' });
  if (tr('frequency').degraded && (w0.frequency ?? 0) >= 2.5 && ctrDown) causes.push({ key: 'saturation', label: 'Saturation d’audience',
    evidence: `Fréquence ${round(w0.frequency as number, 2)} (${sign(tr('frequency').change)} %) avec un CTR en baisse.`,
    action: 'Élargis l’audience ou ouvre de nouvelles audiences ; limite la répétition des mêmes publicités.' });
  if (ctrDown && cpmStable && !causes.some((c) => c.key === 'fatigue')) causes.push({ key: 'creatives', label: 'Créatives moins performantes',
    evidence: `CTR ${sign(tr('ctr').change)} % alors que le CPM est stable (${sign(tr('cpm').change)} %).`,
    action: 'Travaille en priorité tes créatives : nouveaux hooks, nouveaux angles marketing.' });
  if (cpmUp && ctrStable && !cpaUp) causes.push({ key: 'concurrence', label: 'Hausse de la concurrence (enchères)',
    evidence: `CPM ${sign(tr('cpm').change)} % sans baisse du CTR.`, action: 'Surveille le CPA ; teste d’autres placements ou horaires.' });
  if ((cpaUp || tr('conversion').degraded) && !ctrDown) causes.push({ key: 'conversion', label: 'Baisse de conversion / offre moins attractive',
    evidence: `CTR stable mais ${cpaUp ? `CPA ${sign(tr('cpa').change)} %` : `conversion ${sign(tr('conversion').change)} %`}.`,
    action: 'Examine la page produit, le prix, l’offre et les objections des clients.' });
  const metaStable = (tr('cpa').change != null && Math.abs(tr('cpa').change as number) < 15) || (tr('cpa').change == null);
  if (tr('profitPerDay').degraded && metaStable) {
    const delDrop = w0.deliveryRate != null && w1.deliveryRate != null && w0.deliveryRate < w1.deliveryRate - 5;
    causes.push({ key: delDrop ? 'operationnel' : 'marge', label: delDrop ? 'Problème opérationnel (livraison)' : 'Diminution de la marge',
      evidence: delDrop ? `CPA stable mais taux de livraison ${round(w1.deliveryRate as number)} % → ${round(w0.deliveryRate as number)} %.`
        : `CPA stable mais bénéfice/jour ${sign(tr('profitPerDay').change)} %.`,
      action: delDrop ? 'Examine la confirmation, les délais et le suivi des livraisons.' : 'Vérifie tes coûts opérationnels, ton coût d’importation et ton prix.' });
  }

  let status: Status, title: string, summary: string;
  const strongDecline = persistent.length >= 3 || degraded.length >= 4;
  if (strongDecline && (lossNow || ordersDrop || profitDrop)) {
    status = 'rouge'; title = 'DEADZONE PROBABLE';
    summary = `${degraded.length} indicateurs se dégradent${persistent.length ? ` (dont ${persistent.length} sur plusieurs périodes)` : ''} et ${lossNow ? 'le produit est en perte' : ordersDrop ? 'les commandes chutent fortement' : 'le bénéfice s’effondre'}.`;
  } else if (degraded.length >= 2 || persistent.length >= 1 || tr('profitPerDay').degraded || lossNow) {
    status = 'orange'; title = 'PRODUIT EN OBSERVATION';
    summary = lossNow && degraded.length < 2 ? 'Les performances sont stables mais le produit perd de l’argent.' : `${degraded.length} indicateur(s) commence(nt) à se dégrader. Surveille la prochaine période avant de conclure.`;
  } else {
    status = 'vert'; title = 'PRODUIT SAIN';
    summary = profitNow == null ? 'Performances publicitaires stables (rentabilité non calculable : renseigne les commandes et les coûts).' : 'Performances stables et rentabilité positive.';
  }
  return { ...base, status, title, summary, causes };
}
function sign(x: number | null) { if (x == null) return '—'; const r = round(x); return (r > 0 ? '+' : '') + r; }

// ---------------------------------------------------------------- diagnostic business
export interface Problem { key: string; category: string; title: string; impact: number; explanation: string; actions: string[] }
export interface Diagnosis {
  ready: boolean;
  headline: string;
  profitable: boolean | null;
  problems: Problem[];
  main: Problem | null;
  priorities: string[];
}
export function diagnose(a: Analysis, dz?: DeadzoneResult): Diagnosis {
  if (!a.model || !a.profit) {
    return { ready: false, headline: 'Données insuffisantes : renseigne le prix, le coût du produit et au moins une période de résultats (dépenses + commandes).',
      profitable: null, problems: [], main: null, priorities: [] };
  }
  const m = a.model, base = runModel(m);
  const gain = (mod: Partial<ModelInput>) => runModel({ ...m, ...mod }).net - base.net;
  const problems: Problem[] = [];
  const c = a.cpa;
  const pctRate = (x: number) => round(x * 100);

  // Acquisition : CPA au-dessus de l'objectif (ou du break-even)
  const target = c.targetCpa;
  const be = a.breakEven?.perOrder ?? null;
  const cpaRef = target != null ? target : be != null && be > 0 ? be * 0.8 : null;
  if (cpaRef != null && m.cpaOrder > cpaRef) {
    const ctrLow = a.totals.ctrLink != null && a.totals.ctrLink < BENCH.linkCtrLow;
    const dzKeys = new Set((dz?.causes ?? []).map((x) => x.key));
    let category = 'Meta Ads', title = 'CPA trop élevé', actions = ['Produis de nouvelles créatives', 'Teste de nouveaux angles marketing', 'Analyse ton CTR et ton CPC'];
    if (ctrLow || dzKeys.has('creatives')) { category = 'Créatives publicitaires'; title = 'Créatives peu performantes'; actions = ['Produis de nouvelles créatives (hooks différents)', 'Teste de nouveaux angles marketing', 'Surveille ton CTR lien (objectif > 1 %)']; }
    else if (dzKeys.has('conversion')) { category = 'Conversion'; title = 'Conversion insuffisante'; actions = ['Améliore la page produit et la preuve sociale', 'Revois l’offre et le prix affiché', 'Réponds aux objections fréquentes dans la publicité'];
    } else if (dzKeys.has('fatigue') || dzKeys.has('saturation') || dzKeys.has('concurrence')) { category = 'Meta Ads'; title = 'Fatigue publicitaire / audience'; actions = ['Renouvelle tes créatives', 'Ouvre de nouvelles audiences', 'Surveille CPM, CTR et fréquence']; }
    problems.push({ key: 'acquisition', category, title,
      impact: gain({ cpaOrder: cpaRef }),
      explanation: `Ton CPA (${fmtN(m.cpaOrder)}) dépasse ${target != null ? `ton objectif (${fmtN(target)})` : `80 % de ton CPA break-even (${fmtN(cpaRef)})`}.`,
      actions });
  }
  if (m.confirmRate * 100 < BENCH.confirmationLow) problems.push({ key: 'closing', category: 'Closing', title: `Taux de confirmation faible (${pctRate(m.confirmRate)} %)`,
    impact: gain({ confirmRate: BENCH.confirmationTarget / 100 }),
    explanation: `Atteindre ${BENCH.confirmationTarget} % de confirmation changerait ton bénéfice de ${fmtN(gain({ confirmRate: BENCH.confirmationTarget / 100 }))}.`,
    actions: ['Améliore la confirmation des commandes (script, rapidité de rappel)', 'Vérifie les coordonnées dès la commande', 'Qualifie mieux les prospects'] });
  if (m.deliveryRate * 100 < BENCH.deliveryLow) problems.push({ key: 'delivery', category: 'Livraison', title: `Taux de livraison faible (${pctRate(m.deliveryRate)} %)`,
    impact: gain({ deliveryRate: BENCH.deliveryTarget / 100 }),
    explanation: `Atteindre ${BENCH.deliveryTarget} % de livraison changerait ton bénéfice de ${fmtN(gain({ deliveryRate: BENCH.deliveryTarget / 100 }))}.`,
    actions: ['Réduis les commandes refusées (promesse claire, prix total rappelé)', 'Améliore le suivi client avant livraison', 'Surveille ton CPA par livraison'] });
  const importShare = (m.unitCost / m.price) * 100;
  if (importShare > BENCH.importSharePct) problems.push({ key: 'import', category: 'Coût d’importation', title: `Coût d’importation élevé (${round(importShare)} % du prix)`,
    impact: gain({ unitCost: (BENCH.importSharePct / 100) * m.price }),
    explanation: 'Ton coût d’importation représente une part trop importante de ton prix de vente.',
    actions: ['Négocie avec ton fournisseur', 'Optimise le transport (groupage, maritime)', 'Commande des quantités plus importantes'] });
  const delivered = base.delivered || 1;
  // (les coûts d'échec sont traités par le problème « Livraison » : pas de double comptage)
  const opsPerDelivery = (base.closing + base.delivery + base.otherVariable) / delivered;
  const opsShare = (opsPerDelivery / m.price) * 100;
  if (opsShare > BENCH.opsSharePct) {
    const k = (BENCH.opsSharePct / opsShare);
    problems.push({ key: 'operations', category: 'Livraison', title: `Coûts opérationnels élevés (${round(opsShare)} % du prix par livraison)`,
      impact: gain({ closingCost: m.closingCost * k, deliveryCost: m.deliveryCost * k, otherVariable: m.otherVariable * k }),
      explanation: 'Ton acquisition peut être performante, mais tes coûts de closing et de livraison absorbent une grande partie de tes bénéfices.',
      actions: ['Négocie tes tarifs de livraison', 'Réduis le coût de closing (outil, rémunération au résultat)', 'Réduis les échecs de livraison'] });
  }
  // Offre / prix : même avec de bons taux, le prix ne couvre pas le CPA actuel
  const beGood = breakEvenPerOrder({ ...m, confirmRate: Math.max(m.confirmRate, BENCH.confirmationTarget / 100), deliveryRate: Math.max(m.deliveryRate, BENCH.deliveryTarget / 100) });
  if (beGood < m.cpaOrder) problems.push({ key: 'offer', category: 'Offre commerciale', title: 'Prix de vente trop faible pour ton CPA',
    impact: gain({ price: m.price * 1.1 }),
    explanation: 'Même avec de bons taux de confirmation et de livraison, ton prix ne laisse pas assez de marge pour absorber ton CPA actuel.',
    actions: ['Étudie une nouvelle offre tarifaire (prix, lot, upsell)', 'Augmente la valeur perçue', 'Teste un prix plus élevé sur une partie du trafic'] });

  // Tendance : performances qui se dégradent (Deadzone Detector), même si la moyenne reste bonne
  if (dz && (dz.status === 'orange' || dz.status === 'rouge') && dz.causes.length) {
    const [w0, w1] = dz.windows;
    const lostPerWindow = w0?.profitPerDay != null && w1?.profitPerDay != null ? Math.max(0, (w1.profitPerDay - w0.profitPerDay) * dz.windowDays) : 0;
    const cause = dz.causes[0];
    const CAT: Record<string, string> = { fatigue: 'Meta Ads', saturation: 'Meta Ads', concurrence: 'Meta Ads', creatives: 'Créatives publicitaires', conversion: 'Conversion', operationnel: 'Livraison', marge: 'Marge' };
    const ACT: Record<string, string[]> = {
      fatigue: ['Produis de nouvelles créatives', 'Teste de nouveaux angles marketing', 'Analyse ton CTR et ton CPC'],
      saturation: ['Ouvre de nouvelles audiences', 'Produis de nouvelles créatives', 'Surveille la fréquence (objectif < 2,5)'],
      concurrence: ['Surveille ton CPM et ton CPA', 'Teste d’autres placements', 'Produis de nouvelles créatives'],
      creatives: ['Produis de nouvelles créatives (nouveaux hooks)', 'Teste de nouveaux angles marketing', 'Surveille ton CTR lien'],
      conversion: ['Améliore la page produit et l’offre', 'Réponds aux objections des clients', 'Vérifie que le prix reste compétitif'],
      operationnel: ['Améliore la confirmation des commandes', 'Réduis les commandes refusées', 'Surveille ton CPA par livraison'],
      marge: ['Vérifie tes coûts opérationnels', 'Renégocie ton coût d’importation', 'Revois ton prix de vente']
    };
    const existing = problems.find((x) => x.key === 'acquisition');
    if (!existing || CAT[cause.key] !== existing.category) {
      problems.push({ key: 'trend', category: CAT[cause.key] ?? 'Meta Ads', title: `${cause.label} (tendance)`,
        impact: lostPerWindow,
        explanation: `${cause.evidence} Bénéfice perdu sur les ${dz.windowDays} derniers jours par rapport aux ${dz.windowDays} précédents : ${fmtN(lostPerWindow)}.`,
        actions: ACT[cause.key] ?? [cause.action] });
    }
  }

  problems.sort((x, y) => y.impact - x.impact);
  const relevant = problems.filter((x) => x.impact > 0);
  const main = relevant[0] ?? null;
  const priorities: string[] = [];
  for (const pr of relevant) { if (priorities.length >= 3) break; if (pr.actions[0] && !priorities.includes(pr.actions[0])) priorities.push(pr.actions[0]); }
  for (const pr of relevant) for (const act of pr.actions) { if (priorities.length >= 3) break; if (!priorities.includes(act)) priorities.push(act); }

  const net = a.profit.net, profitable = net >= 0;
  let headline: string;
  const dzBad = dz && (dz.status === 'orange' || dz.status === 'rouge');
  if (!main) headline = profitable ? 'Ton produit est rentable et aucun point faible majeur n’est détecté.' : 'Ton produit perd de l’argent sans cause dominante : vérifie tes coûts fixes et ton volume.';
  else headline = `${profitable ? 'Ton produit reste rentable' : 'Ton produit perd de l’argent'}${dzBad ? ` et ses performances se dégradent (${dz!.title.toLowerCase()})` : ''}. Problème principal : ${main.category}.`;
  return { ready: true, headline, profitable, problems: relevant, main, priorities };
}
function fmtN(x: number) { return Math.round(x).toLocaleString('fr-FR'); }

// ---------------------------------------------------------------- classement (dashboard)
export type Rank = 'meilleurs' | 'surveiller' | 'optimiser' | 'deficitaires' | 'incomplets';
export function rankProduct(a: Analysis, dz: DeadzoneResult): Rank {
  if (!a.profit) return 'incomplets';
  if (a.profit.net < 0) return 'deficitaires';
  if (dz.status === 'orange' || dz.status === 'rouge') return 'surveiller';
  const lowMargin = a.profit.netMarginPct != null && a.profit.netMarginPct < 15;
  const overTarget = a.cpa.targetStatus === 'over';
  if (lowMargin || overTarget) return 'optimiser';
  return 'meilleurs';
}
