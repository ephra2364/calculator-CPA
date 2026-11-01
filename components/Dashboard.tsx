'use client';
import { useMemo, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Store } from '@/lib/store';
import { summarize, RANK_LABEL, RANK_TONE, STATUS_LABEL, STATUS_TONE, profitTone } from '@/lib/view';
import { div, pct, type Rank } from '@/lib/engine';
import { money, percent } from '@/lib/format';
import { Banner, Button, Card, Pill, Stat } from './ui';
import { exampleData } from '@/lib/examples';
import { validateImport } from '@/lib/store';
import type { Tab } from './ProductView';

export function Dashboard({ store, openProduct, newProduct }: { store: Store; openProduct: (id: string, tab?: Tab) => void; newProduct: () => void }) {
  const { products, periods } = store.data;
  const sums = useMemo(() => products.map((p) => summarize(p, periods)), [products, periods]);
  const fileRef = useRef<HTMLInputElement>(null);

  const tot = sums.reduce((a, s) => {
    const t = s.analysis.totals, pr = s.analysis.profit;
    a.spend += t.adSpend; a.received += t.received; a.delivered += t.delivered;
    if (pr) { a.revenue += pr.revenue; a.net += pr.net; a.withProfit++; }
    return a;
  }, { spend: 0, received: 0, delivered: 0, revenue: 0, net: 0, withProfit: 0 });
  const count = (f: (s: (typeof sums)[number]) => boolean) => sums.filter(f).length;
  const groups: Rank[] = ['meilleurs', 'surveiller', 'optimiser', 'deficitaires', 'incomplets'];
  const chart = sums.filter((s) => s.analysis.profit).map((s) => ({ name: s.product.name.replace(/^Exemple — /, ''), net: Math.round(s.analysis.profit!.net) }));
  const hasExamples = products.some((p) => p.isExample);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cpa-calculator-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importData = async (f: File) => {
    try {
      const d = validateImport(JSON.parse(await f.text()));
      if (!d) { alert('Fichier invalide : ce n’est pas une sauvegarde CPA CALCULATOR.'); return; }
      if (confirm(`Remplacer les données actuelles par la sauvegarde (${d.products.length} produits, ${d.periods.length} périodes) ?`)) store.replaceAll(d);
    } catch { alert('Fichier illisible.'); }
  };

  if (!products.length) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Pilote la rentabilité de tes produits</h1>
        <p className="mt-2 text-slate-600">Renseigne tes coûts, tes dépenses Meta Ads et tes livraisons : CPA CALCULATOR calcule ton vrai CPA, ton bénéfice réel, détecte la deadzone et te dit quoi améliorer en priorité.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="primary" onClick={newProduct}>+ Créer mon premier produit</Button>
          <Button onClick={() => store.mergeExamples(exampleData())}>Charger des exemples</Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>Restaurer une sauvegarde</Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
        <p className="mt-6 text-xs text-slate-500">Tes données restent dans ce navigateur (aucun compte nécessaire). Pense à exporter une sauvegarde régulièrement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Toutes les périodes saisies, tous produits confondus.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button small onClick={exportData}>Exporter une sauvegarde</Button>
          <Button small variant="ghost" onClick={() => fileRef.current?.click()}>Restaurer</Button>
          {hasExamples ? <Button small variant="ghost" onClick={() => confirm('Supprimer les produits d’exemple ?') && store.removeExamples()}>Retirer les exemples</Button>
            : <Button small variant="ghost" onClick={() => store.mergeExamples(exampleData())}>Charger des exemples</Button>}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Produits suivis" value={products.length} />
        <Stat label="Dépenses publicitaires" value={money(tot.spend)} />
        <Stat label="Chiffre d’affaires livré" value={money(tot.revenue)} hint="Commandes livrées uniquement (encaissé)" />
        <Stat label="Bénéfice total" value={money(tot.net)} tone={profitTone(tot.withProfit ? tot.net : null)} hint="Après publicité, frais et charges fixes" />
        <Stat label="CPA moyen" value={money(div(tot.spend, tot.received))} hint="Par commande reçue" />
        <Stat label="CPA moyen par livraison" value={money(div(tot.spend, tot.delivered))} />
        <Stat label="Marge globale" value={percent(pct(tot.net, tot.revenue))} tone={profitTone(tot.withProfit ? tot.net : null)} />
        <Stat label="Statuts" value={<span className="text-sm font-medium leading-6 text-slate-700">
          {count((s) => !!s.analysis.profit && s.analysis.profit.net >= 0)} rentables · {count((s) => !!s.analysis.profit && s.analysis.profit.net < 0)} déficitaires<br />
          {count((s) => s.dz.status === 'orange')} en observation · {count((s) => s.dz.status === 'rouge')} en deadzone probable</span>} />
      </div>

      {chart.length > 0 && (
        <Card title="Bénéfice par produit" subtitle="Bénéfice net sur l’ensemble des périodes saisies">
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={44} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar isAnimationActive={false} dataKey="net" name="Bénéfice net" radius={[6, 6, 0, 0]}>
                  {chart.map((c, i) => <Cell key={i} fill={c.net >= 0 ? '#059669' : '#e11d48'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const items = sums.filter((s) => s.rank === g);
          if (!items.length && g === 'incomplets') return null;
          return (
            <Card key={g} title={<span className="flex items-center gap-2">{RANK_LABEL[g]} <Pill tone={RANK_TONE[g]}>{items.length}</Pill></span>}>
              {items.length ? (
                <ul className="divide-y divide-slate-100">
                  {items.map((s) => (
                    <li key={s.product.id}>
                      <button onClick={() => openProduct(s.product.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.product.name || 'Sans nom'}</div>
                          <div className="text-xs text-slate-500">{s.diag.main ? `Problème principal : ${s.diag.main.category}` : s.analysis.missing[0] ? `Manque : ${s.analysis.missing[0]}` : 'Aucun problème majeur'}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`text-sm font-semibold ${s.analysis.profit ? (s.analysis.profit.net >= 0 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}`}>{s.analysis.profit ? money(s.analysis.profit.net) : '—'}</span>
                          <Pill tone={STATUS_TONE[s.dz.status]}>{STATUS_LABEL[s.dz.status]}</Pill>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">Aucun produit.</p>}
            </Card>
          );
        })}
      </div>
      <Banner tone="gray">Données enregistrées dans ce navigateur uniquement. Exporte une sauvegarde pour les conserver ou les transférer vers un autre appareil.</Banner>
    </div>
  );
}
