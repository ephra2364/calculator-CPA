'use client';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Store } from '@/lib/store';
import type { Num, Period, Product } from '@/lib/types';
import { analyze, daysInclusive } from '@/lib/engine';
import { emptyPeriod } from '@/lib/factory';
import { addDays, dateFr, money, num, percent, todayIso } from '@/lib/format';
import { Banner, Button, Card, Explain, Grid, NumField, TextField } from './ui';

export function HistoryView({ store, product }: { store: Store; product: Product }) {
  const periods = useMemo(() => store.data.periods.filter((p) => p.productId === product.id).sort((a, b) => a.start.localeCompare(b.start)), [store.data.periods, product.id]);
  const [editing, setEditing] = useState<Period | null>(null);
  const cur = product.currency || 'FCFA';

  const rows = useMemo(() => periods.map((p) => {
    const a = analyze(product, [p]);
    return { p, a, label: `${dateFr(p.start).slice(0, 5)}–${dateFr(p.end).slice(0, 5)}`,
      cpa: a.cpa.cpaOrder, cpm: a.totals.cpm, ctr: a.totals.ctrLink ?? a.totals.ctrAll, spend: a.totals.adSpend,
      orders: a.totals.hasOrders ? a.totals.received : null, delivery: a.cpa.deliveryRate, profit: a.profit ? a.profit.net : null };
  }), [periods, product]);

  const newPeriod = () => {
    const last = periods[periods.length - 1];
    const start = last ? addDays(last.end, 1) : addDays(todayIso(), -7);
    setEditing(emptyPeriod(product.id, { start, end: addDays(start, 6), fixedCosts: null }));
  };

  if (editing) return <PeriodForm product={product} initial={editing} existing={periods}
    onCancel={() => setEditing(null)} onSave={(p) => { store.upsertPeriod(p); setEditing(null); }} />;

  return (
    <div className="space-y-4">
      <Card title="Résultats par période" subtitle="Chaque saisie est une nouvelle période : les anciennes ne sont jamais écrasées."
        right={<Button variant="primary" small onClick={newPeriod}>+ Nouvelle période</Button>}>
        {!periods.length ? (
          <div className="py-6 text-center text-sm text-slate-500">
            Aucune période. Ajoute tes dépenses Meta Ads, tes commandes et tes livraisons pour obtenir ton diagnostic.
            <div className="mt-3"><Button variant="primary" onClick={newPeriod}>+ Saisir ma première période</Button></div>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Période</th><th className="pr-3 font-medium">Dépenses</th><th className="pr-3 font-medium">Commandes</th>
                <th className="pr-3 font-medium">Livrées</th><th className="pr-3 font-medium">CPA</th><th className="pr-3 font-medium">Bénéfice</th><th />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...rows].reverse().map(({ p, a }) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3"><div className="font-medium">{dateFr(p.start)} → {dateFr(p.end)}</div><div className="text-xs text-slate-500">{daysInclusive(p.start, p.end)} jours{p.note ? ` · ${p.note}` : ''}</div></td>
                    <td className="pr-3">{money(a.totals.adSpend, cur)}</td>
                    <td className="pr-3">{a.totals.hasOrders ? num(a.totals.received) : '—'}</td>
                    <td className="pr-3">{a.totals.hasOrders ? num(a.totals.delivered) : '—'}</td>
                    <td className="pr-3">{money(a.cpa.cpaOrder, cur)}</td>
                    <td className={`pr-3 font-semibold ${a.profit ? (a.profit.net >= 0 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}`}>{a.profit ? money(a.profit.net, cur) : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button small variant="ghost" onClick={() => setEditing(p)}>Modifier</Button>
                      <Button small variant="ghost" onClick={() => confirm('Supprimer cette période ?') && store.deletePeriod(p.id)}>Supprimer</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Chart title="CPA par commande" data={rows} k="cpa" fmt={(v) => money(v, cur)} color="#0f172a" />
          <Chart title="Bénéfice" data={rows} k="profit" fmt={(v) => money(v, cur)} color="#059669" />
          <Chart title="CPM" data={rows} k="cpm" fmt={(v) => money(v, cur)} color="#d97706" />
          <Chart title="CTR (lien)" data={rows} k="ctr" fmt={(v) => percent(v, 1)} color="#0284c7" />
          <Chart title="Dépenses publicitaires" data={rows} k="spend" fmt={(v) => money(v, cur)} color="#7c3aed" />
          <Chart title="Commandes reçues" data={rows} k="orders" fmt={(v) => num(v)} color="#334155" />
          <Chart title="Taux de livraison" data={rows} k="delivery" fmt={(v) => percent(v, 1)} color="#059669" />
        </div>
      )}
      {rows.length === 1 && <Banner tone="gray">Les graphiques d’évolution apparaissent à partir de deux périodes.</Banner>}
    </div>
  );
}

function Chart({ title, data, k, fmt, color }: { title: string; data: Record<string, unknown>[]; k: string; fmt: (v: number) => string; color: string }) {
  if (!data.some((d) => d[k] != null)) return null;
  return (
    <Card title={title}>
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v * 10) / 10))} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Line isAnimationActive={false} type="monotone" dataKey={k} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls name={title} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function PeriodForm({ product, initial, existing, onSave, onCancel }: { product: Product; initial: Period; existing: Period[]; onSave: (p: Period) => void; onCancel: () => void }) {
  const [p, setP] = useState<Period>(initial);
  const cur = product.currency || 'FCFA';
  const set = (patch: Partial<Period>) => setP((x) => ({ ...x, ...patch }));
  const setM = (k: keyof Period['meta']) => (v: Num) => setP((x) => ({ ...x, meta: { ...x.meta, [k]: v } }));
  const setO = (k: keyof Period['orders']) => (v: Num) => setP((x) => ({ ...x, orders: { ...x.orders, [k]: v } }));
  const o = p.orders;
  const errors: string[] = [];
  const warns: string[] = [];
  if (!p.start || !p.end) errors.push('Indique la date de début et la date de fin.');
  else if (p.start > p.end) errors.push('La date de début doit précéder la date de fin.');
  const gt = (a: Num, b: Num) => a != null && b != null && a > b;
  if (gt(o.confirmed, o.received)) errors.push('Plus de commandes confirmées que de commandes reçues.');
  if (gt(o.shipped, o.confirmed)) errors.push('Plus de commandes expédiées que de confirmées.');
  if (gt(o.delivered, o.shipped)) errors.push('Plus de commandes livrées que d’expédiées.');
  const failures = (o.refused ?? 0) + (o.unreachable ?? 0) + (o.returned ?? 0);
  if (o.shipped != null && o.delivered != null && failures > o.shipped - o.delivered) warns.push('Refusées + injoignables + retournées dépassent les colis non livrés : vérifie les chiffres (un colis ne doit être compté qu’une fois).');
  if (o.delivered == null && (o.received != null || o.confirmed != null)) warns.push('Sans nombre de commandes livrées, la rentabilité ne peut pas être calculée.');
  const overlap = existing.find((x) => x.id !== p.id && p.start && p.end && x.start <= p.end && p.start <= x.end);
  if (overlap) warns.push(`Cette période chevauche celle du ${dateFr(overlap.start)} au ${dateFr(overlap.end)} : les résultats seraient comptés deux fois dans les totaux.`);
  if (p.adSpend == null) warns.push('Dépenses publicitaires non renseignées : le CPA ne pourra pas être calculé.');

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!errors.length) onSave(p); }}>
      <Card title={existing.some((x) => x.id === p.id) ? 'Modifier la période' : 'Nouvelle période'} subtitle="Saisis les chiffres tels qu’ils apparaissent dans Meta Ads et dans ton suivi de commandes.">
        <Grid cols={3}>
          <TextField label="Date de début" type="date" value={p.start} onChange={(v) => set({ start: v })} />
          <TextField label="Date de fin (incluse)" type="date" value={p.end} onChange={(v) => set({ end: v })} />
          <NumField label="Dépenses publicitaires" value={p.adSpend} onChange={(v) => set({ adSpend: v })} suffix={cur} min={0} />
        </Grid>
      </Card>
      <Card title="Commandes et livraisons" subtitle="Tes vrais chiffres (pas les achats attribués par Meta).">
        <Grid cols={4}>
          <NumField label="Reçues" value={o.received} onChange={setO('received')} min={0} />
          <NumField label="Confirmées" value={o.confirmed} onChange={setO('confirmed')} min={0} />
          <NumField label="Expédiées" value={o.shipped} onChange={setO('shipped')} min={0} />
          <NumField label="Livrées" value={o.delivered} onChange={setO('delivered')} min={0} />
          <NumField label="Refusées" value={o.refused} onChange={setO('refused')} min={0} />
          <NumField label="Clients injoignables" value={o.unreachable} onChange={setO('unreachable')} min={0} />
          <NumField label="Retournées" value={o.returned} onChange={setO('returned')} min={0} />
          <NumField label="Annulées" value={o.cancelled} onChange={setO('cancelled')} min={0} />
        </Grid>
        <div className="mt-2"><Explain>Non livrées = expédiées − livrées. Si « expédiées » est vide : livrées + refusées + injoignables + retournées.</Explain></div>
      </Card>
      <Card title="Métriques Meta Ads" subtitle="Facultatif mais nécessaire pour le Deadzone Detector. Remplis ce que tu as.">
        <Grid cols={4}>
          <NumField label="Impressions" value={p.meta.impressions} onChange={setM('impressions')} min={0} />
          <NumField label="CPM" value={p.meta.cpm} onChange={setM('cpm')} suffix={cur} min={0} />
          <NumField label="CTR global" value={p.meta.ctrAll} onChange={setM('ctrAll')} suffix="%" min={0} />
          <NumField label="CTR lien sortant" value={p.meta.ctrLink} onChange={setM('ctrLink')} suffix="%" min={0} />
          <NumField label="CPC lien sortant" value={p.meta.cpcLink} onChange={setM('cpcLink')} suffix={cur} min={0} />
          <NumField label="Clics sur lien" value={p.meta.linkClicks} onChange={setM('linkClicks')} min={0} />
          <NumField label="Ajouts au panier" value={p.meta.addToCart} onChange={setM('addToCart')} min={0} />
          <NumField label="Paiements initiés" value={p.meta.initiateCheckout} onChange={setM('initiateCheckout')} min={0} />
          <NumField label="Achats attribués (Meta)" value={p.meta.metaPurchases} onChange={setM('metaPurchases')} min={0} />
          <NumField label="CPA Meta" value={p.meta.metaCpa} onChange={setM('metaCpa')} suffix={cur} min={0} />
          <NumField label="ROAS" value={p.meta.roas} onChange={setM('roas')} min={0} />
          <NumField label="Fréquence" value={p.meta.frequency} onChange={setM('frequency')} min={0} />
        </Grid>
      </Card>
      <Card title="Frais de la période" subtitle="Laisse vide pour utiliser les frais du produit.">
        <Grid cols={4}>
          <NumField label="Closing par commande" value={p.closingCostOverride} onChange={(v) => set({ closingCostOverride: v })} suffix={cur} min={0} placeholder={product.closingCost != null ? String(product.closingCost) : '—'} />
          <NumField label="Livraison réussie" value={p.deliverySuccessCostOverride} onChange={(v) => set({ deliverySuccessCostOverride: v })} suffix={cur} min={0} placeholder={product.deliverySuccessCost != null ? String(product.deliverySuccessCost) : '—'} />
          <NumField label="Livraison échouée" value={p.deliveryFailCostOverride} onChange={(v) => set({ deliveryFailCostOverride: v })} suffix={cur} min={0} placeholder={product.deliveryFailCost != null ? String(product.deliveryFailCost) : '—'} />
          <NumField label="Charges fixes imputées" value={p.fixedCosts} onChange={(v) => set({ fixedCosts: v })} suffix={cur} min={0} hint={product.fixedCostsMonthly ? `Pour info : ${money(product.fixedCostsMonthly, cur)} / mois` : undefined} />
        </Grid>
        <div className="mt-3"><TextField label="Note (facultatif)" value={p.note} onChange={(v) => set({ note: v })} placeholder="Ex. nouvelle créative, promo…" /></div>
      </Card>
      {errors.length > 0 && <Banner tone="red" title="À corriger">{errors.map((e) => <div key={e}>{e}</div>)}</Banner>}
      {warns.length > 0 && <Banner tone="orange" title="À vérifier">{warns.map((e) => <div key={e}>{e}</div>)}</Banner>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary" disabled={errors.length > 0}>Enregistrer la période</Button>
      </div>
    </form>
  );
}
