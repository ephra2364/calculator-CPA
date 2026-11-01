// Calcul rapide : une saisie (journée ou période) → rentable ? scaler ? évolution ?
import { analyze, change, daysInclusive, div } from './engine';
import type { Period, Product } from './types';

export type Verdict = 'scaler' | 'maintenir' | 'pas-rentable' | 'incomplet';
export interface Quick {
  days: number;
  spend: number;
  metaPurchases: number | null;
  orders: number;
  delivered: number;
  revenue: number | null;
  profit: number | null;
  profitPerDay: number | null;
  marginPct: number | null;
  cpaMeta: number | null;
  cpaOrder: number | null;
  cpaDelivered: number | null;
  deliveryRate: number | null; // livrées ÷ commandes
  marginPerPiece: number | null; // prix − coût pièce − livraison
  maxCpaDelivered: number | null; // dépense pub maximale par livraison
  maxCpaOrder: number | null;
  metaGapPct: number | null; // achats Meta vs commandes Shopify
  verdict: Verdict;
  reason: string;
  missing: string[];
}

export function quick(product: Product, p: Period): Quick {
  const a = analyze(product, [p]);
  const t = a.totals;
  const days = p.start && p.end ? Math.max(1, daysInclusive(p.start, p.end)) : 1;
  const unit = a.unit.value;
  const price = product.price;
  const deliveryCost = product.deliverySuccessCost ?? 0;
  const marginPerPiece = price != null && unit != null ? price - unit - deliveryCost - (product.otherVariableCost ?? 0) : null;
  const missing: string[] = [];
  if (price == null) missing.push('prix de vente');
  if (unit == null) missing.push('coût de la pièce');
  if (p.adSpend == null) missing.push('dépenses publicitaires');
  if (p.orders.received == null) missing.push('commandes');
  if (p.orders.delivered == null) missing.push('livrées');
  const profit = a.profit ? a.profit.net : null;
  const q: Quick = {
    days, spend: t.adSpend, metaPurchases: t.metaPurchases, orders: t.received, delivered: t.delivered,
    revenue: a.profit ? a.profit.revenue : null, profit, profitPerDay: profit == null ? null : profit / days,
    marginPct: a.profit ? a.profit.netMarginPct : null,
    cpaMeta: t.metaCpa, cpaOrder: a.cpa.cpaOrder, cpaDelivered: a.cpa.cpaDelivered,
    deliveryRate: t.received > 0 && p.orders.delivered != null ? (t.delivered / t.received) * 100 : null,
    marginPerPiece,
    maxCpaDelivered: a.breakEven?.perDelivered ?? (marginPerPiece != null ? marginPerPiece : null),
    maxCpaOrder: a.breakEven?.perOrder ?? null,
    metaGapPct: t.metaPurchases != null && t.received > 0 ? change(t.metaPurchases, t.received) : null,
    verdict: 'incomplet', reason: '', missing
  };
  if (missing.length || profit == null) {
    q.reason = `Renseigne : ${missing.join(', ') || 'les données manquantes'}.`;
    return q;
  }
  if (q.delivered <= 0) {
    q.verdict = 'pas-rentable';
    q.reason = 'Aucune livraison : tu as dépensé sans encaisser.';
    return q;
  }
  const maxD = q.maxCpaDelivered;
  if (profit < 0) {
    q.verdict = 'pas-rentable';
    if (marginPerPiece != null && marginPerPiece <= 0) q.reason = 'Ton prix ne couvre pas le coût de la pièce + la livraison : augmente le prix ou baisse tes coûts.';
    else if (q.deliveryRate != null && q.deliveryRate < 60) q.reason = `Trop de commandes non livrées (${Math.round(q.deliveryRate)} % livrées) : travaille la confirmation et le suivi avant de toucher à la pub.`;
    else q.reason = `Ta pub coûte ${fmt(q.cpaDelivered)} par livraison alors que tu peux payer au maximum ${fmt(maxD)} : améliore tes créatives ou coupe.`;
    return q;
  }
  const safety = maxD != null && maxD > 0 && q.cpaDelivered != null ? q.cpaDelivered / maxD : 1;
  if (q.deliveryRate != null && q.deliveryRate < 60) {
    q.verdict = 'maintenir';
    q.reason = `Rentable, mais seulement ${Math.round(q.deliveryRate)} % des commandes sont livrées : améliore la confirmation et la livraison avant d’augmenter le budget.`;
  } else if (safety <= 0.7) {
    q.verdict = 'scaler';
    q.reason = `Rentable avec de la marge : tu paies ${fmt(q.cpaDelivered)} de pub par livraison sur un maximum de ${fmt(maxD)}. Augmente le budget par paliers de 20 à 30 %.`;
  } else {
    q.verdict = 'maintenir';
    q.reason = `Rentable mais la marge de sécurité est faible (${fmt(q.cpaDelivered)} de pub par livraison sur un maximum de ${fmt(maxD)}). Garde le budget et améliore d’abord ton CPA ou ton taux de livraison.`;
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
  if (cpaCh != null && Math.abs(cpaCh) >= 5) parts.push(`CPA ${cpaCh > 0 ? 'en hausse' : 'en baisse'} de ${Math.round(Math.abs(cpaCh))} %`);
  if (delPts != null && Math.abs(delPts) >= 3) parts.push(`livraison ${delPts > 0 ? '+' : ''}${Math.round(delPts)} pts`);
  if (profitCh != null && Math.abs(profitCh) >= 5) parts.push(`bénéfice/jour ${profitCh > 0 ? '+' : ''}${Math.round(profitCh)} %`);
  const text = parts.length ? `Par rapport à la saisie précédente : ${parts.join(', ')}.` : 'Stable par rapport à la saisie précédente.';
  return { profitPerDay: profitCh, cpaOrder: cpaCh, cpaMeta: metaCh, deliveryPts: delPts, worse, text };
}

/** Le verdict « scaler » est abaissé à « maintenir » si la tendance se dégrade. */
export function finalVerdict(q: Quick, ev: Evolution | null): { verdict: Verdict; reason: string } {
  if (q.verdict === 'scaler' && ev?.worse) return { verdict: 'maintenir', reason: `Rentable, mais les performances se dégradent (${ev.text.replace('Par rapport à la saisie précédente : ', '').replace(/\.$/, '')}). Attends de confirmer la tendance avant de scaler.` };
  return { verdict: q.verdict, reason: q.reason };
}

function fmt(x: number | null) { return x == null ? '—' : `${Math.round(x).toLocaleString('fr-FR')} FCFA`; }
export { div };
