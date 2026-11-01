// Calcul rapide : une saisie (journée ou période) → bénéfice réel, rentable ? scaler ? évolution ? objectif du mois ?
import { analyze, change, daysInclusive, parseDay } from './engine';
import type { Period, Product } from './types';

export type Verdict = 'scaler' | 'maintenir' | 'pas-rentable' | 'incomplet';
export interface PieceBreakdown { price: number; piece: number; importCost: number; delivery: number; other: number; ads: number; failed: number; profit: number }
export interface Quick {
  days: number;
  spend: number;
  metaPurchases: number | null;
  orders: number;
  delivered: number;
  revenue: number | null;
  profit: number | null; // bénéfice net réel de la saisie
  profitPerDay: number | null;
  profitPerPiece: number | null; // bénéfice net réel par pièce livrée (pub déduite)
  marginPct: number | null; // marge nette réelle
  targetMarginPct: number | null;
  cpaMeta: number | null;
  cpaOrder: number | null;
  cpaDelivered: number | null;
  deliveryRate: number | null; // livrées ÷ commandes
  marginPerPiece: number | null; // prix − coût pièce − livraison (avant pub)
  maxCpaDelivered: number | null; // pub maximale par livraison avant perte
  maxCpaForTarget: number | null; // pub maximale par livraison pour tenir l'objectif de marge
  metaGapPct: number | null;
  piece: PieceBreakdown | null;
  verdict: Verdict;
  reason: string;
  missing: string[];
}
const n0 = (x: number | null | undefined) => (x == null || !isFinite(x) ? 0 : x);

export function pieceCosts(p: Product) {
  const a = analyze(p, []);
  const unit = a.unit.value;
  if (p.costMode === 'piece') return { piece: n0(p.pieceCost), importCost: n0(p.importPerPiece), unit };
  return { piece: n0(unit), importCost: 0, unit };
}

export function quick(product: Product, p: Period): Quick {
  const a = analyze(product, [p]);
  const t = a.totals;
  const days = p.start && p.end ? Math.max(1, daysInclusive(p.start, p.end)) : 1;
  const { piece, importCost, unit } = pieceCosts(product);
  const price = product.price;
  const deliveryCost = n0(product.deliverySuccessCost);
  const other = n0(product.otherVariableCost);
  const marginPerPiece = price != null && unit != null ? price - unit - deliveryCost - other : null;
  const target = product.targetMarginPct ?? null;
  const missing: string[] = [];
  if (price == null) missing.push('prix de vente');
  if (unit == null) missing.push('coût de la pièce');
  if (p.adSpend == null) missing.push('dépenses publicitaires');
  if (p.orders.received == null) missing.push('commandes');
  if (p.orders.delivered == null) missing.push('livrées');
  const profit = a.profit ? a.profit.net : null;
  const ppp = profit != null && t.delivered > 0 ? profit / t.delivered : null;
  const maxD = a.breakEven?.perDelivered ?? marginPerPiece;
  const q: Quick = {
    days, spend: t.adSpend, metaPurchases: t.metaPurchases, orders: t.received, delivered: t.delivered,
    revenue: a.profit ? a.profit.revenue : null, profit, profitPerDay: profit == null ? null : profit / days,
    profitPerPiece: ppp,
    marginPct: a.profit ? a.profit.netMarginPct : null, targetMarginPct: target,
    cpaMeta: t.metaCpa, cpaOrder: a.cpa.cpaOrder, cpaDelivered: a.cpa.cpaDelivered,
    deliveryRate: t.received > 0 && p.orders.delivered != null ? (t.delivered / t.received) * 100 : null,
    marginPerPiece, maxCpaDelivered: maxD,
    maxCpaForTarget: maxD != null && price != null && target != null ? maxD - (price * target) / 100 : null,
    metaGapPct: t.metaPurchases != null && t.received > 0 ? change(t.metaPurchases, t.received) : null,
    piece: null, verdict: 'incomplet', reason: '', missing
  };
  if (price != null && unit != null && a.profit && t.delivered > 0) {
    const d = t.delivered;
    const failed = (a.profit.failedCosts + a.profit.closing + a.profit.fixedCosts) / d;
    q.piece = { price, piece, importCost, delivery: a.profit.deliverySuccess / d, other: a.profit.otherVariable / d, ads: t.adSpend / d, failed, profit: a.profit.net / d };
  }
  if (missing.length || profit == null) {
    q.reason = `Renseigne : ${missing.join(', ') || 'les données manquantes'}.`;
    return q;
  }
  if (q.delivered <= 0) {
    q.verdict = 'pas-rentable';
    q.reason = 'Aucune livraison : tu as dépensé sans encaisser.';
    return q;
  }
  if (profit < 0) {
    q.verdict = 'pas-rentable';
    if (marginPerPiece != null && marginPerPiece <= 0) q.reason = 'Ton prix ne couvre pas le coût de la pièce + la livraison : augmente le prix ou baisse tes coûts.';
    else if (q.deliveryRate != null && q.deliveryRate < 60) q.reason = `Trop de commandes non livrées (${Math.round(q.deliveryRate)} % livrées) : travaille la confirmation et le suivi avant de toucher à la pub.`;
    else q.reason = `Ta pub coûte ${fmt(q.cpaDelivered)} par pièce livrée alors que tu peux payer au maximum ${fmt(maxD)} : améliore tes créatives ou coupe.`;
    return q;
  }
  if (q.deliveryRate != null && q.deliveryRate < 60) {
    q.verdict = 'maintenir';
    q.reason = `Rentable, mais seulement ${Math.round(q.deliveryRate)} % des commandes sont livrées : améliore la confirmation et la livraison avant d’augmenter le budget.`;
    return q;
  }
  if (target != null && q.marginPct != null) {
    if (q.marginPct >= target) {
      q.verdict = 'scaler';
      q.reason = `Ta marge nette (${Math.round(q.marginPct)} %) atteint ton objectif de ${target} %. Augmente le budget par paliers de 20 à 30 % en gardant une pub sous ${fmt(q.maxCpaForTarget)} par pièce livrée.`;
    } else {
      q.verdict = 'maintenir';
      q.reason = `Rentable, mais ta marge nette (${Math.round(q.marginPct)} %) est sous ton objectif de ${target} %. Pour l’atteindre, ta pub doit descendre à ${fmt(q.maxCpaForTarget)} par pièce livrée (actuellement ${fmt(q.cpaDelivered)}).`;
    }
    return q;
  }
  const safety = maxD != null && maxD > 0 && q.cpaDelivered != null ? q.cpaDelivered / maxD : 1;
  if (safety <= 0.7) {
    q.verdict = 'scaler';
    q.reason = `Rentable avec de la marge : tu paies ${fmt(q.cpaDelivered)} de pub par pièce livrée sur un maximum de ${fmt(maxD)}. Augmente le budget par paliers de 20 à 30 %.`;
  } else {
    q.verdict = 'maintenir';
    q.reason = `Rentable mais la marge de sécurité est faible (${fmt(q.cpaDelivered)} de pub par pièce livrée sur un maximum de ${fmt(maxD)}). Garde le budget et améliore d’abord ton CPA ou ton taux de livraison.`;
  }
  return q;
}

export interface Evolution { profitPerDay: number | null; cpaOrder: number | null; cpaMeta: number | null; deliveryPts: number | null; worse: boolean; text: string }
export function evolution(cur: Quick, prev: Quick | null): Evolution | null {
  if (!prev || prev.profitPerDay == null || cur.profitPerDay == null) return null;
  const profitCh = change(cur.profitPerDay, prev.profitPerDay);
  const cpaCh = change(cur.cpaOrder, prev.cpaOrder);
  const metaCh = change(cur.cpaMeta, prev.cpaMeta);
  const delPts = cur.deliveryRate != null && prev.deliveryRate != null ? cur.deliveryRate - prev.deliveryRate : null;
  const worse = (profitCh != null && profitCh <= -20) || (cpaCh != null && cpaCh >= 15) || (delPts != null && delPts <= -10) || (prev.profitPerDay > 0 && cur.profitPerDay < 0);
  const parts: string[] = [];
  if (profitCh != null && Math.abs(profitCh) >= 5) parts.push(`bénéfice par jour ${profitCh > 0 ? 'en hausse' : 'en baisse'} de ${Math.round(Math.abs(profitCh))} %`);
  if (cpaCh != null && Math.abs(cpaCh) >= 5) parts.push(`CPA ${cpaCh > 0 ? 'en hausse' : 'en baisse'} de ${Math.round(Math.abs(cpaCh))} %`);
  if (delPts != null && Math.abs(delPts) >= 3) parts.push(`taux de livraison ${delPts > 0 ? '+' : ''}${Math.round(delPts)} points`);
  const text = parts.length ? `Par rapport à la saisie précédente : ${parts.join(', ')}.` : 'Stable par rapport à la saisie précédente.';
  return { profitPerDay: profitCh, cpaOrder: cpaCh, cpaMeta: metaCh, deliveryPts: delPts, worse, text };
}

/** Le verdict « scaler » est abaissé à « maintenir » si la tendance se dégrade. */
export function finalVerdict(q: Quick, ev: Evolution | null): { verdict: Verdict; reason: string } {
  if (q.verdict === 'scaler' && ev?.worse) return { verdict: 'maintenir', reason: `Rentable, mais les résultats se dégradent (${ev.text.replace('Par rapport à la saisie précédente : ', '').replace(/\.$/, '')}). Attends de confirmer la tendance avant de scaler.` };
  return { verdict: q.verdict, reason: q.reason };
}

// ---------------------------------------------------------------- objectif du mois
export interface MonthPlan {
  monthLabel: string;
  daysInMonth: number;
  dayOfMonth: number;
  remainingDays: number; // jours restants après aujourd'hui
  profitSoFar: number; // bénéfice des saisies du mois
  daysWithData: number;
  avgProfitPerDay: number | null; // rythme actuel
  projection: number | null; // bénéfice estimé fin de mois au rythme actuel
  target: number | null;
  progressPct: number | null;
  status: 'atteint' | 'en-avance' | 'en-retard' | 'sans-objectif' | 'pas-de-donnees';
  neededPerDay: number | null; // bénéfice à faire par jour pour atteindre l'objectif
  deliveriesPerDay: number | null; // livraisons / jour nécessaires
  ordersPerDay: number | null; // commandes / jour nécessaires
  adBudgetPerDay: number | null; // budget pub / jour estimé
  basis: string; // hypothèse du calcul
}
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function monthPlan(product: Product, entries: Period[], today: string): MonthPlan {
  const [y, m, d] = today.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ms = Date.UTC(y, m - 1, 1), me = Date.UTC(y, m - 1, daysInMonth);
  const mine = entries.filter((e) => e.productId === product.id && e.start && e.end).sort((a, b) => a.start.localeCompare(b.start));
  let profitSoFar = 0, daysWithData = 0, mSpend = 0, mDelivered = 0, mOrders = 0;
  const qs = mine.map((e) => ({ e, q: quick(product, e) }));
  for (const { e, q } of qs) {
    if (q.profit == null) continue;
    const s = parseDay(e.start), en = parseDay(e.end);
    const os = Math.max(s, ms), oe = Math.min(en, me);
    if (oe < os) continue;
    const ov = Math.round((oe - os) / 86400000) + 1;
    const f = ov / q.days; // part de la saisie dans le mois (prorata des jours)
    profitSoFar += q.profit * f;
    daysWithData += ov;
    mSpend += q.spend * f; mDelivered += q.delivered * f; mOrders += q.orders * f;
  }
  // Rythme : saisies du mois ; à défaut, la dernière saisie connue
  const last = [...qs].reverse().find((x) => x.q.profit != null);
  const avg = daysWithData > 0 ? profitSoFar / daysWithData : last ? last.q.profitPerDay : null;
  const remainingDays = Math.max(0, daysInMonth - d);
  const daysLeftToFill = Math.max(0, daysInMonth - daysWithData);
  const projection = avg == null ? null : profitSoFar + avg * daysLeftToFill;
  const target = product.monthlyProfitTarget ?? null;
  // Rendement par pièce et coût d'acquisition : ensemble du mois, sinon dernière saisie valable
  const ref = mDelivered > 0
    ? { profitPerPiece: profitSoFar / mDelivered, deliveryRate: mOrders > 0 ? (mDelivered / mOrders) * 100 : null, cpaDelivered: mSpend / mDelivered }
    : last?.q;
  const remaining = target != null ? target - profitSoFar : null;
  const neededPerDay = remaining != null && daysLeftToFill > 0 ? Math.max(0, remaining) / daysLeftToFill : null;
  const deliveriesPerDay = neededPerDay != null && ref?.profitPerPiece && ref.profitPerPiece > 0 ? neededPerDay / ref.profitPerPiece : null;
  const ordersPerDay = deliveriesPerDay != null && ref?.deliveryRate ? deliveriesPerDay / (ref.deliveryRate / 100) : null;
  const adBudgetPerDay = deliveriesPerDay != null && ref?.cpaDelivered != null ? deliveriesPerDay * ref.cpaDelivered : null;
  let status: MonthPlan['status'];
  if (avg == null) status = 'pas-de-donnees';
  else if (target == null) status = 'sans-objectif';
  else if (profitSoFar >= target) status = 'atteint';
  else status = projection != null && projection >= target ? 'en-avance' : 'en-retard';
  return {
    monthLabel: `${MONTHS[m - 1]} ${y}`, daysInMonth, dayOfMonth: d, remainingDays, profitSoFar, daysWithData,
    avgProfitPerDay: avg, projection, target, progressPct: target ? (profitSoFar / target) * 100 : null, status,
    neededPerDay, deliveriesPerDay, ordersPerDay, adBudgetPerDay,
    basis: daysWithData > 0 ? `rythme moyen de tes ${daysWithData} jour(s) saisi(s) ce mois-ci` : 'rythme de ta dernière saisie'
  };
}

function fmt(x: number | null) { return x == null ? '—' : `${Math.round(x).toLocaleString('fr-FR')} FCFA`; }
